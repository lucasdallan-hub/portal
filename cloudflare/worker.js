import { DurableObject } from 'cloudflare:workers';
import { createAuthCore } from '../scripts/auth-core.mjs';

const encoder = new TextEncoder();
const emptyState = () => ({ users: [], data: { patients: [], appointments: [], posts: [], stories: [] }, version: 0 });
const toHex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
const fromHex = text => Uint8Array.from(text.match(/.{2}/g) || [], value => parseInt(value, 16));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
async function hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  return `pbkdf2:${iterations}:${toHex(salt)}:${toHex(await derive(password, salt, iterations))}`;
}
async function verify(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algorithm, count, salt, expected] = stored.split(':');
  if (algorithm !== 'pbkdf2' || count !== '100000' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(expected || '')) return false;
  const actual = await derive(password, fromHex(salt), Number(count));
  const target = fromHex(expected);
  let difference = 0;
  for (let i = 0; i < target.length; i++) difference |= target[i] ^ actual[i];
  return difference === 0;
}

function securityHeaders(headers = {}) {
  return new Headers({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store', ...headers });
}

// One application object provides ordered writes and durable accounts/sessions.
export class Portal extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS portal_snapshot (part INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    const chunks = this.sql.exec('SELECT value FROM portal_snapshot ORDER BY part').toArray();
    const saved = chunks.length ? JSON.parse(chunks.map(row => row.value).join('')) : { state: emptyState(), sessions: [], attempts: [] };
    const commit = (state, { sessions, attempts }) => {
      const now = Date.now();
      const snapshot = JSON.stringify({ state, sessions: sessions.filter(([, s]) => s.expires > now), attempts: attempts.filter(([, a]) => a.until > now) });
      // Chunking keeps every SQL value below the per-value limit, even with media.
      ctx.storage.transactionSync(() => {
        this.sql.exec('DELETE FROM portal_snapshot');
        for (let offset = 0, part = 0; offset < snapshot.length; part++) {
          let end = Math.min(offset + 65536, snapshot.length);
          // Never split an emoji/surrogate pair when SQLite encodes the text as UTF-8.
          const last = snapshot.charCodeAt(end - 1);
          if (end < snapshot.length && last >= 0xD800 && last <= 0xDBFF) end--;
          this.sql.exec('INSERT INTO portal_snapshot(part, value) VALUES (?, ?)', part, snapshot.slice(offset, end));
          offset = end;
        }
      });
    };
    this.auth = createAuthCore({ initialState: saved.state, initialSessions: saved.sessions, initialAttempts: saved.attempts, commit, hash, verify, persistSessions: true, cookieSecure: env.COOKIE_SECURE !== 'false' });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: securityHeaders({ Allow: 'GET, HEAD' }) });
      return new Response(request.method === 'HEAD' ? null : JSON.stringify({ status: 'ok' }), { headers: securityHeaders({ 'Content-Type': 'application/json; charset=utf-8' }) });
    }
    if (!url.pathname.startsWith('/api/')) return new Response('Não encontrado', { status: 404 });
    // The UI submits its complete state. Bound the body for the Workers memory budget.
    const bodyLimit = 16 * 1024 * 1024;
    const req = {
      method: request.method,
      headers: { ...Object.fromEntries(request.headers), host: url.host },
      socket: { remoteAddress: request.headers.get('CF-Connecting-IP') || 'local' },
      async *[Symbol.asyncIterator]() {
        if (!request.body) return;
        const reader = request.body.getReader();
        let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > bodyLimit) throw Object.assign(new Error('Os dados ultrapassam 16 MB por gravação nesta hospedagem.'), { status: 413 });
            yield value;
          }
        } finally { reader.releaseLock(); }
      },
    };
    const headers = securityHeaders();
    let status = 200, body = null, finished = false;
    const res = {
      destroyed: false,
      get headersSent() { return finished; },
      setHeader(name, value) { headers.set(name, value); return this; },
      removeHeader(name) { headers.delete(name); return this; },
      writeHead(code, values = {}) { status = code; for (const [name, value] of Object.entries(values)) headers.set(name, value); return this; },
      end(value) { body = value ?? null; finished = true; return this; },
    };
    await this.auth(req, res, url);
    if (!finished) return new Response(JSON.stringify({ error: 'Não foi possível concluir a operação.' }), { status: 500, headers });
    return new Response(body, { status, headers });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      const object = env.PORTAL.get(env.PORTAL.idFromName('portal'));
      return object.fetch(request);
    }
    // Static production builds do not use development live reload.
    if (url.pathname === '/events') return new Response(null, { status: 204 });
    return env.ASSETS.fetch(request);
  },
};

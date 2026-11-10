import http from 'node:http';
import { readFile, watch } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAuth } from './auth.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

export function createPortalServer({
  dataDir = process.env.DATA_DIR || path.join(projectRoot, '.data'),
  publicRoot = path.join(projectRoot, 'public'),
  liveReload = process.env.NODE_ENV !== 'production',
} = {}) {
  const root = path.resolve(publicRoot);
  const auth = createAuth(path.resolve(dataDir));
  const clients = new Set();
  let watcher;
  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { res.writeHead(400).end('URL inválida'); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');

    if (url.pathname === '/health') {
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); res.writeHead(405).end(); return; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(200).end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
      return;
    }
    if (url.pathname.startsWith('/api/')) { void auth(req, res, url); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); res.writeHead(405).end(); return; }
    if (url.pathname === '/events') {
      if (req.method === 'HEAD') { res.writeHead(200).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    let file;
    try { file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); }
    catch { res.writeHead(400).end('Caminho inválido'); return; }
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end('Acesso negado'); return; }
    readFile(file, (error, content) => {
      if (res.destroyed) return;
      if (error) { res.writeHead(404).end('Não encontrado'); return; }
      res.setHeader('Content-Type', mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Content-Length', content.length);
      res.writeHead(200).end(req.method === 'HEAD' ? undefined : content);
    });
  });
  if (liveReload) {
    watcher = watch(root, { recursive: true }, () => {
      for (const res of clients) if (!res.destroyed) res.write('data: update\n\n');
    });
    watcher.on('error', () => console.error('Atualização automática indisponível. O portal continua em execução.'));
  }
  // End long-lived reload streams before waiting for all HTTP connections to close.
  const close = server.close.bind(server);
  server.close = callback => {
    watcher?.close();
    for (const res of clients) res.end();
    clients.clear();
    return close(callback);
  };
  server.headersTimeout = 65000;
  server.requestTimeout = 120000;
  return server;
}

export async function startServer({
  port = process.env.PORT ?? '3000',
  host = process.env.HOST || '0.0.0.0',
  ...options
} = {}) {
  if (!/^\d+$/.test(String(port)) || !Number.isInteger(Number(port)) || Number(port) < 0 || Number(port) > 65535) {
    throw new Error('PORT inválida. Use um número de 0 a 65535 (normalmente 3000).');
  }
  const server = createPortalServer(options);
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(Number(port), host, resolve);
    });
  } catch (error) {
    server.close();
    throw error;
  }
  const address = server.address();
  console.log(`Nutri portal iniciado na porta ${address.port}`);
  console.log(`Servidor HTTP em ${host}:${address.port}. Verificação: GET /health`);
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close();
    const timer = setTimeout(() => server.closeAllConnections(), 10000);
    timer.unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.once('close', () => {
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
  });
  return server;
}

// Keep the previous entry point working for existing integrations and tests.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { await startServer(); }
  catch (error) { console.error(`Não foi possível iniciar o portal: ${error.message}`); process.exitCode = 1; }
}

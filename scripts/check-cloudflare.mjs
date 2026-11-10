// Verify the real Cloudflare runtime against an isolated Wrangler persistence directory.
// BASE_URL=http://127.0.0.1:8787 CHECK_STATE_FILE=/tmp/nutri-cloud-check.json node scripts/check-cloudflare.mjs
// Restart Wrangler with the same --persist-to directory, then use CHECK_PHASE=persistence.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

if (!process.env.BASE_URL) throw Error('Defina BASE_URL para a instância Wrangler isolada.');
const base = new URL(process.env.BASE_URL);
if (!['http:', 'https:'].includes(base.protocol)) throw Error('BASE_URL deve usar HTTP ou HTTPS.');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) && process.env.ALLOW_REMOTE_TEST_DATA !== 'true') {
  throw Error('Por segurança, use Wrangler local com --persist-to em /tmp. Este teste cria dados fictícios.');
}
const root = path.resolve(import.meta.dirname, '..');
const stateFile = process.env.CHECK_STATE_FILE;
const phase = process.env.CHECK_PHASE || 'initial';
const request = async (endpoint, method = 'GET', data, cookie) => {
  const response = await fetch(new URL(endpoint, base), {
    method,
    headers: { Origin: base.origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const body = await response.json().catch(() => { throw Error(`${endpoint} não retornou JSON (HTTP ${response.status}).`); });
  return { status: response.status, body, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};
const expected = (result, status, operation) => { assert.equal(result.status, status, `${operation}: ${result.body.error || JSON.stringify(result.body)}`); return result; };

expected(await request('/health'), 200, 'health');
assert.deepEqual((await request('/health')).body, { status: 'ok' });
const html = await fetch(new URL('/', base));
assert.equal(html.status, 200, 'Página inicial indisponível.');
assert.match(html.headers.get('content-type') || '', /text\/html/);
assert.match(await html.text(), /Nutri/);
for (const asset of ['/app.js', '/members.js', '/style.css']) assert.equal((await fetch(new URL(asset, base))).status, 200, asset);

if (phase === 'persistence') {
  if (!stateFile) throw Error('CHECK_STATE_FILE é necessário para verificar persistência.');
  const snapshot = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal((await request('/api/session')).body.needsSetup, false, 'A configuração inicial se perdeu após reiniciar.');
  const session = expected(await request('/api/session', 'GET', undefined, snapshot.superCookie), 200, 'sessão persistida');
  assert.equal(session.body.user?.id, snapshot.superId, 'Sessão do superadmin não persistiu no Durable Object.');
  const state = expected(await request('/api/state', 'GET', undefined, snapshot.superCookie), 200, 'estado persistido').body;
  assert.ok(state.data.patients.some(p => p.id === snapshot.patientId), 'Paciente não persistiu.');
  assert.ok(state.data.appointments.some(a => a.id === snapshot.appointmentId), 'Consulta não persistiu.');
  assert.ok(state.data.stories.some(s => s.id === snapshot.videoId && s.video?.startsWith('data:video/mp4;base64,')), 'Vídeo não persistiu.');
  assert.ok(state.data.stories.some(s => s.id === snapshot.photoId && s.photo?.startsWith('data:image/png;base64,')), 'Foto não persistiu.');
  for (const [id, hash] of snapshot.unicodeHashes || []) {
    const post = state.data.posts.find(p => p.id === id);
    assert.ok(post, 'Registro Unicode não persistiu.');
    assert.equal(createHash('sha256').update(post.text).digest('hex'), hash, 'Texto Unicode foi alterado nos limites dos blocos SQLite.');
  }
  const login = expected(await request('/api/login', 'POST', { username: snapshot.patientUsername, password: snapshot.patientPassword }), 200, 'login persistido');
  const personal = expected(await request('/api/state', 'GET', undefined, login.cookie), 200, 'dados do paciente').body;
  assert.equal(personal.data.patients[0]?.id, snapshot.patientId);
  assert.equal(personal.data.stories.length, 0);
  console.log('PASS Cloudflare persistência: contas, sessão, paciente, consulta, fotos e vídeos sobrevivem ao reinício do Wrangler.');
} else if (phase === 'initial') {
  expected(await request('/api/state'), 401, 'API privada sem sessão');
  assert.equal((await request('/api/session')).body.needsSetup, true, 'Use uma instância Wrangler nova com --persist-to em diretório temporário.');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const password = randomBytes(24).toString('hex');
  const patientPassword = randomBytes(24).toString('hex');
  const email = `cloud-super-${suffix}@example.test`;
  const adminEmail = `cloud-admin-${suffix}@example.test`;
  const otherEmail = `cloud-other-${suffix}@example.test`;
  const patientEmail = `cloud-patient-${suffix}@example.test`;
  const patientId = 'patient-' + suffix;
  const appointmentId = 'appointment-' + suffix;
  const photoId = 'photo-' + suffix;
  const videoId = 'video-' + suffix;
  const patientUsername = 'patient-' + suffix;
  const superAccount = expected(await request('/api/setup', 'POST', { name: 'Superadmin Cloudflare teste', email, password }), 200, 'setup');
  const superCookie = superAccount.cookie;
  assert.ok(superCookie, 'Cookie de sessão ausente.');
  expected(await request('/api/setup', 'POST', { name: 'Outro', email: 'unused@example.test', password }), 409, 'setup único');
  for (const [name, memberEmail] of [['Nutricionista teste', adminEmail], ['Outra nutricionista', otherEmail]]) expected(await request('/api/users', 'POST', { name, email: memberEmail, password, role: 'admin' }, superCookie), 201, 'criar nutricionista');
  const admin = expected(await request('/api/login', 'POST', { email: adminEmail, password }), 200, 'login admin');
  const other = expected(await request('/api/login', 'POST', { email: otherEmail, password }), 200, 'login outro admin');
  expected(await request('/api/login', 'POST', { email: adminEmail, password: 'senha-incorreta' }), 401, 'senha incorreta');
  let state = expected(await request('/api/state', 'GET', undefined, admin.cookie), 200, 'estado inicial admin').body;
  state.data.patients.push({ id: patientId, name: 'Paciente Cloudflare teste', height: 170, weight: 70, goal: 'Bem-estar', notes: 'Plano de teste', history: [] });
  state.data.appointments.push({ id: appointmentId, patient: patientId, date: '2026-11-10', time: '09:00', type: 'Consulta de retorno', status: 'Confirmada' });
  state.data.posts.push({ id: 'published-' + suffix, title: 'Conteúdo publicado Cloudflare', text: 'Orientação educativa', emoji: '🥗', status: 'Publicado', date: '2026-11-10' }, { id: 'draft-' + suffix, title: 'Rascunho privado Cloudflare', text: 'Ainda não publicado', status: 'Rascunho', date: '2026-11-10' });
  const photo = 'data:image/png;base64,' + (await readFile(path.join(root, 'test/fixtures/story.png'))).toString('base64');
  const video = 'data:video/mp4;base64,' + (await readFile(path.join(root, 'test/fixtures/story.mp4'))).toString('base64');
  state.data.stories.push({ id: photoId, title: 'Foto de teste', text: '', emoji: '📷', created: Date.now(), photo }, { id: videoId, title: 'Vídeo de teste', text: 'Legenda', created: Date.now(), video });
  expected(await request('/api/state', 'PUT', state, admin.cookie), 200, 'salvar dados e mídias');
  expected(await request('/api/state', 'PUT', state, admin.cookie), 409, 'versão antiga');
  assert.equal((await request('/api/state', 'GET', undefined, other.cookie)).body.data.patients.length, 0);
  expected(await request('/api/users', 'POST', { name: 'Não autorizado', email: 'forbidden@example.test', password, role: 'superadmin' }, admin.cookie), 403, 'somente superadmin cria acesso');
  const member = expected(await request('/api/users', 'POST', { name: 'Paciente Cloudflare teste', email: patientEmail, username: patientUsername, password: patientPassword, role: 'usuario', patientId }, superCookie), 201, 'criar paciente');
  const patient = expected(await request('/api/login', 'POST', { username: patientUsername, password: patientPassword }), 200, 'login paciente');
  const personal = expected(await request('/api/state', 'GET', undefined, patient.cookie), 200, 'escopo paciente').body;
  assert.equal(personal.data.patients.length, 1);
  assert.equal(personal.data.patients[0].id, patientId);
  assert.equal(personal.data.appointments.length, 1);
  assert.equal(personal.data.posts.length, 1);
  assert.equal(personal.data.posts[0].status, 'Publicado');
  assert.equal(personal.data.stories.length, 0);
  expected(await request('/api/state', 'PUT', personal, patient.cookie), 403, 'paciente somente leitura');
  expected(await request('/api/users', 'GET', undefined, patient.cookie), 403, 'gestão bloqueada para paciente');
  const csrf = await fetch(new URL('/api/logout', base), { method: 'POST', headers: { Origin: 'https://untrusted.example', Cookie: patient.cookie } });
  assert.equal(csrf.status, 403);
  const renamed = 'renamed-' + suffix;
  expected(await request('/api/account', 'PATCH', { username: renamed, email: adminEmail, currentPassword: password }, admin.cookie), 200, 'editar conta');
  expected(await request('/api/login', 'POST', { username: renamed, password }), 200, 'login por usuário alterado');
  expected(await request('/api/users', 'PATCH', { id: member.body.user.id, active: false }, superCookie), 200, 'bloquear paciente');
  expected(await request('/api/state', 'GET', undefined, patient.cookie), 401, 'sessão do bloqueado');
  expected(await request('/api/users', 'PATCH', { id: member.body.user.id, active: true }, superCookie), 200, 'reativar paciente');
  const temporary = expected(await request('/api/users', 'POST', { name: 'Conta temporária', email: `temporary-${suffix}@example.test`, password, role: 'admin' }, superCookie), 201, 'criar conta temporária');
  expected(await request('/api/users', 'PATCH', { id: temporary.body.user.id, name: 'Conta editada' }, superCookie), 200, 'editar membro');
  expected(await request('/api/users', 'DELETE', { id: temporary.body.user.id }, superCookie), 200, 'excluir membro');
  const global = expected(await request('/api/state', 'GET', undefined, superCookie), 200, 'estado global').body;
  const deleteId = 'delete-post-' + suffix;
  global.data.posts.push({ id: deleteId, title: 'Conteúdo para excluir', text: 'Teste de exclusão', status: 'Rascunho' });
  const updated = expected(await request('/api/state', 'PUT', global, superCookie), 200, 'criar conteúdo para excluir');
  expected(await request('/api/manage', 'DELETE', { resource: 'post', id: deleteId, version: updated.body.version }, admin.cookie), 403, 'exclusão global restrita');
  expected(await request('/api/manage', 'DELETE', { resource: 'post', id: deleteId, version: updated.body.version }, superCookie), 200, 'excluir conteúdo');
  expected(await request('/api/users', 'DELETE', { id: superAccount.body.user.id }, superCookie), 409, 'proteção do último superadmin');

  // Exercise SQLite snapshot chunks across non-BMP (surrogate-pair) text boundaries.
  const unicode = expected(await request('/api/state', 'GET', undefined, superCookie), 200, 'estado para Unicode').body;
  const unicodeHashes = [];
  for (let i = 0; i < 8; i++) {
    const id = `unicode-${suffix}-${i}`, text = '💚'.repeat(9000) + '-' + i;
    unicode.data.posts.push({ id, title: 'Regressão Unicode ' + i, text, status: 'Rascunho' });
    unicodeHashes.push([id, createHash('sha256').update(text).digest('hex')]);
  }
  expected(await request('/api/state', 'PUT', unicode, superCookie), 200, 'salvar texto Unicode');

  if (process.env.PLAYWRIGHT_MODULE_PATH || process.env.CHECK_BROWSER === 'true') {
    const require = createRequire(import.meta.url);
    const module = process.env.PLAYWRIGHT_MODULE_PATH ? await import(process.env.PLAYWRIGHT_MODULE_PATH) : require('playwright');
    const { chromium } = module.default ?? module;
    const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}), args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.goto(base.href);
      await page.getByLabel('Usuário ou e-mail', { exact: true }).fill(patientUsername);
      await page.getByLabel('Senha', { exact: true }).fill(patientPassword);
      await page.getByRole('button', { name: 'Entrar no meu espaço' }).click();
      await page.getByRole('heading', { name: 'Meu plano e orientações' }).waitFor();
      assert.equal(await page.locator('nav a').count(), 3);
      assert.equal(await page.locator('nav a[href="#stories"]').count(), 0);
      await page.locator('nav a[href="#content"]').click();
      await page.getByRole('heading', { name: 'Conteúdo publicado Cloudflare', exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Rascunho privado Cloudflare', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      console.log('PASS Cloudflare navegador: login real, paciente com três menus, conteúdos publicados e layout móvel.');
    } finally { await browser.close(); }
  }
  if (stateFile) await writeFile(stateFile, JSON.stringify({ unicodeHashes, superCookie, superId: superAccount.body.user.id, patientId, appointmentId, photoId, videoId, patientUsername, patientPassword }), { mode: 0o600 });
  console.log('PASS Cloudflare API: setup único, três perfis, CRUD, escopo por nutricionista, foto/vídeo, conflito, conta, bloqueio e CSRF.');
} else {
  throw Error('CHECK_PHASE deve ser initial ou persistence.');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWhatsApp, normalizeWhatsAppPhone, pendingWhatsAppProvider } from '../scripts/whatsapp-service.mjs';

function fixture({ status = {}, send } = {}) {
  const db = {
    users: [], version: 1,
    data: {
      patients: [
        { id: 'patient-a', ownerId: 'admin-a', name: 'Ana', phone: '(11) 99999-0000', whatsappConsent: true },
        { id: 'patient-b', ownerId: 'admin-b', name: 'Bruna', phone: '+55 (21) 98888-0000', whatsappConsent: true },
      ],
      appointments: [
        { id: 'appointment-a', patient: 'patient-a', date: '2026-11-12', time: '14:30', status: 'Confirmada' },
        { id: 'appointment-b', patient: 'patient-b', date: '2026-11-13', time: '15:00', status: 'Confirmada' },
        { id: 'cancelled-a', patient: 'patient-a', date: '2026-11-14', time: '15:00', status: 'Cancelada' },
      ], posts: [], stories: [],
    },
  };
  const user = { id: 'admin-a', role: 'admin' };
  const calls = [];
  const storage = { writes: 0, checkpoints: 0, failOnCommit: null, persisted: structuredClone(db), checkpoint: structuredClone(db) };
  const provider = {
    status: () => ({ provider: 'test-provider', configured: true, templateConfigured: true, webhookConfigured: false, ...status }),
    async send(args) {
      calls.push(structuredClone(args));
      return send ? send(args, storage) : { messageId: 'provider-message-' + calls.length };
    },
  };
  function commit() {
    storage.writes++;
    if (storage.writes === storage.failOnCommit) throw Error('simulated storage failure');
    storage.persisted = structuredClone(db);
  }
  function checkpoint() { storage.checkpoints++; storage.checkpoint = structuredClone(db); }
  function restore(value) { for (const key of Object.keys(db)) delete db[key]; Object.assign(db, structuredClone(value)); }
  function request(method = 'POST', body = { patientId: 'patient-a', kind: 'text', text: 'Olá, Ana!' }, overrides = {}) {
    return handleWhatsApp({ method, body, db, user, provider, commit, checkpoint, ...overrides });
  }
  return { db, user, calls, provider, storage, commit, checkpoint, request, restore };
}

const statusIs = code => error => error.status === code;

test('telefones brasileiros são normalizados e formatos inválidos são rejeitados', () => {
  assert.equal(normalizeWhatsAppPhone('(11) 99999-0000'), '5511999990000');
  assert.equal(normalizeWhatsAppPhone('11 3333-2222'), '551133332222');
  assert.equal(normalizeWhatsAppPhone('+55 (21) 98888-0000'), '5521988880000');
  assert.equal(normalizeWhatsAppPhone('5511999990000'), '5511999990000');
  assert.equal(normalizeWhatsAppPhone('+1 (415) 555-0100'), '14155550100');
  for (const phone of ['', null, 5511999990000, 'abc', '0001112223333', '+55119999900000000', 'https://example.test']) assert.throws(() => normalizeWhatsAppPhone(phone), statusIs(400));
});

test('paciente não pode gerenciar mensagens, admin só acessa seus pacientes e superadmin acessa todos', async () => {
  const f = fixture();
  await assert.rejects(() => f.request('GET', {}, { user: { id: 'patient-user', role: 'usuario' } }), statusIs(403));
  await assert.rejects(() => f.request('POST', undefined, { user: { id: 'patient-user', role: 'usuario' } }), statusIs(403));
  await assert.rejects(() => f.request('POST', { patientId: 'patient-b', kind: 'text', text: 'Olá' }), statusIs(404));
  assert.equal(f.calls.length, 0);
  const result = await f.request('POST', { patientId: 'patient-b', kind: 'text', text: 'Olá' }, { user: { id: 'root', role: 'superadmin' } });
  assert.equal(result.status, 'accepted');
  assert.equal(f.calls[0].to, '5521988880000');
});

test('provedor padrão é pendente, não simula envio e não expõe credenciais no status', async () => {
  const f = fixture();
  const pending = await f.request('GET', {}, { provider: pendingWhatsAppProvider });
  assert.equal(pending.provider, 'dallanspace');
  assert.equal(pending.configured, false);
  assert.deepEqual(pending.messages, []);
  await assert.rejects(() => f.request('POST', undefined, { provider: pendingWhatsAppProvider }), statusIs(503));
  await assert.rejects(() => f.request('POST', undefined, { provider: { status: () => ({ configured: true }) } }), statusIs(503));
  assert.equal(f.calls.length, 0);
  assert.equal(f.storage.writes, 0);
  const safe = await f.request('GET', {}, { provider: { status: () => ({ configured: true, provider: 'custom', accessToken: 'never-expose', appSecret: 'private' }) } });
  assert.deepEqual(safe, { provider: 'custom', configured: true, templateConfigured: false, webhookConfigured: false, messages: [] });
});

test('autorização explícita e telefone válido são pré-requisitos para enviar', async () => {
  const f = fixture();
  f.db.data.patients[0].whatsappConsent = false;
  await assert.rejects(() => f.request(), statusIs(400));
  delete f.db.data.patients[0].whatsappConsent;
  await assert.rejects(() => f.request(), statusIs(400));
  f.db.data.patients[0].whatsappConsent = 'true';
  await assert.rejects(() => f.request(), statusIs(400));
  f.db.data.patients[0].whatsappConsent = true;
  f.db.data.patients[0].phone = 'não é telefone';
  await assert.rejects(() => f.request(), statusIs(400));
  assert.equal(f.calls.length, 0);
  assert.equal(f.storage.writes, 0);
});

test('lembrete exige consulta válida do paciente e recurso configurado', async () => {
  const f = fixture();
  for (const appointmentId of ['appointment-b', 'cancelled-a', 'missing']) await assert.rejects(() => f.request('POST', { patientId: 'patient-a', kind: 'appointment', appointmentId }), statusIs(400));
  f.provider.status = () => ({ configured: true, templateConfigured: false });
  await assert.rejects(() => f.request('POST', { patientId: 'patient-a', kind: 'appointment', appointmentId: 'appointment-a' }), statusIs(503));
  f.provider.status = () => ({ configured: true, templateConfigured: true });
  const sent = await f.request('POST', { patientId: 'patient-a', kind: 'appointment', appointmentId: 'appointment-a' });
  assert.equal(sent.status, 'accepted');
  assert.deepEqual(f.calls, [{ to: '5511999990000', kind: 'appointment', text: '', patientName: 'Ana', appointment: { date: '2026-11-12', time: '14:30' } }]);
});

test('texto tem tamanho limitado e janela de conversa é respeitada quando exigida pelo provedor', async () => {
  const f = fixture({ status: { requiresSessionWindow: true } });
  for (const text of ['', '   ', 'a'.repeat(2001), null]) await assert.rejects(() => f.request('POST', { patientId: 'patient-a', kind: 'text', text }), statusIs(400));
  await assert.rejects(() => f.request(), statusIs(400));
  f.db.whatsapp = { messages: [], lastInbound: { 'patient-a': Date.now() - 86400001 } };
  await assert.rejects(() => f.request(), statusIs(400));
  f.db.whatsapp.lastInbound['patient-a'] = Date.now() - 1000;
  assert.equal((await f.request()).status, 'accepted');
  assert.equal(f.calls.length, 1);
});

test('intenção é persistida e checkpoint criado antes do envio, seguido de aceitação confirmada', async () => {
  const f = fixture({ send: (_args, storage) => {
    assert.equal(storage.writes, 1);
    assert.equal(storage.checkpoints, 1);
    assert.equal(storage.persisted.whatsapp.messages[0].status, 'unknown');
    assert.equal(storage.checkpoint.whatsapp.messages[0].status, 'unknown');
    assert.ok(!JSON.stringify(storage.persisted.whatsapp.messages[0]).includes('Olá, Ana!'));
    return { messageId: 'confirmed-id' };
  } });
  const result = await f.request();
  assert.equal(result.status, 'accepted');
  assert.equal(result.messageId, 'confirmed-id');
  assert.equal(f.storage.writes, 2);
  assert.equal(f.storage.checkpoints, 2);
  assert.equal(f.storage.persisted.whatsapp.messages[0].status, 'accepted');
});

test('resultado sem identificador e falha externa ficam desconhecidos e não são reenviados automaticamente', async () => {
  for (const response of [null, {}, { messageId: '' }, { messageId: '   ' }, { messageId: 123 }, { messageId: 'a'.repeat(201) }]) {
    const f = fixture({ send: () => response });
    const result = await f.request();
    assert.equal(result.status, 'unknown');
    assert.equal(f.storage.persisted.whatsapp.messages[0].status, 'unknown');
    assert.equal(f.storage.writes, 1);
    await assert.rejects(() => f.request(), statusIs(409));
    assert.equal(f.calls.length, 1);
  }
  const f = fixture({ send: () => { throw Error('provider token should-not-leak'); } });
  const result = await f.request();
  assert.equal(result.status, 'unknown');
  assert.ok(!JSON.stringify(result).includes('should-not-leak'));
  await assert.rejects(() => f.request(), statusIs(409));
  assert.equal(f.calls.length, 1);
});

test('duplicação em 60 segundos é bloqueada e histórico não vaza dados internos ou de outro admin', async () => {
  const f = fixture();
  await f.request();
  await assert.rejects(() => f.request(), statusIs(409));
  assert.equal(f.calls.length, 1);
  f.db.whatsapp.messages.push({ id: 'foreign', patientId: 'patient-b', status: 'accepted', kind: 'text', createdAt: Date.now(), messageId: 'foreign-id', fingerprint: 'private', createdBy: 'admin-b', text: 'Texto privado' });
  const own = await f.request('GET', {});
  assert.equal(own.messages.length, 1);
  assert.deepEqual(Object.keys(own.messages[0]).sort(), ['id', 'patientId', 'kind', 'status', 'createdAt', 'messageId'].sort());
  assert.ok(!JSON.stringify(own).includes('foreign'));
  assert.ok(!JSON.stringify(own).includes('fingerprint'));
  const all = await f.request('GET', {}, { user: { id: 'root', role: 'superadmin' } });
  assert.equal(all.messages.length, 2);
  f.db.whatsapp.messages[0].createdAt = Date.now() - 61000;
  assert.equal((await f.request()).status, 'accepted');
  assert.equal(f.calls.length, 2);
});

test('limite de cinco solicitações por minuto não faz uma sexta chamada ao provedor', async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) assert.equal((await f.request('POST', { patientId: 'patient-a', kind: 'text', text: 'Mensagem ' + i })).status, 'accepted');
  await assert.rejects(() => f.request('POST', { patientId: 'patient-a', kind: 'text', text: 'Mensagem seis' }), statusIs(429));
  assert.equal(f.calls.length, 5);
});

test('falha de persistência da intenção impede qualquer chamada externa', async () => {
  const f = fixture();
  f.storage.failOnCommit = 1;
  await assert.rejects(() => f.request(), /storage failure/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.storage.checkpoints, 0);
  assert.equal(f.storage.persisted.whatsapp, undefined);
});

test('falha após envio preserva checkpoint desconhecido e bloqueia repetição ao restaurar', async () => {
  const f = fixture();
  f.storage.failOnCommit = 2;
  await assert.rejects(() => f.request(), /storage failure/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.storage.persisted.whatsapp.messages[0].status, 'unknown');
  assert.equal(f.storage.checkpoint.whatsapp.messages[0].status, 'unknown');
  // auth-core restores the last checkpoint when a synchronous durable commit fails.
  f.restore(f.storage.checkpoint);
  await assert.rejects(() => f.request(), statusIs(409));
  assert.equal(f.calls.length, 1);
});

test('métodos e tipos de mensagem não suportados são rejeitados antes do envio', async () => {
  const f = fixture();
  await assert.rejects(() => f.request('DELETE', {}), statusIs(405));
  await assert.rejects(() => f.request('POST', { patientId: 'patient-a', kind: 'audio', text: 'teste' }), statusIs(400));
  assert.equal(f.calls.length, 0);
});

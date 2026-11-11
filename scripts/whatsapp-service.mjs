// Provider-neutral orchestration. A transport must be verified against the
// provider's documentation before it is configured to send real messages.
export const pendingWhatsAppProvider = {
  status() { return { provider: 'dallanspace', configured: false, templateConfigured: false, webhookConfigured: false }; },
};
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function normalizeWhatsAppPhone(input) {
  if (typeof input !== 'string' || !/^\+?[\d\s().-]+$/.test(input.trim())) fail(400, 'Informe um telefone válido com DDD e código do país.');
  let digits = input.replace(/\D/g, '');
  if (!input.trim().startsWith('+') && (digits.length === 10 || digits.length === 11)) digits = '55' + digits;
  if (!/^[1-9]\d{9,14}$/.test(digits)) fail(400, 'Informe um telefone válido com DDD e código do país.');
  return digits;
}

export async function handleWhatsApp({ method, body, db, user, provider = pendingWhatsAppProvider, commit, checkpoint }) {
  if (user.role === 'usuario') fail(403, 'Apenas a equipe pode gerenciar mensagens.');
  const configured = provider.status();
  const status = { provider: configured.provider || 'dallanspace', configured: Boolean(configured.configured), templateConfigured: Boolean(configured.templateConfigured), webhookConfigured: Boolean(configured.webhookConfigured) };
  const visible = patient => user.role === 'superadmin' || patient.ownerId === user.id;
  const patients = db.data.patients.filter(visible);
  if (method === 'GET') return {
    ...status,
    messages: (db.whatsapp?.messages || []).filter(m => patients.some(p => p.id === m.patientId)).slice(-100).reverse().map(({ id, patientId, kind, status, createdAt, messageId }) => ({ id, patientId, kind, status, createdAt, messageId })),
  };
  if (method !== 'POST') fail(405, 'Método não permitido.');
  const patient = patients.find(p => p.id === body.patientId);
  if (!patient) fail(404, 'Paciente não encontrado no seu acompanhamento.');
  if (!status.configured || typeof provider.send !== 'function') fail(503, 'A conexão com a API Dallanspace ainda precisa ser configurada conforme a documentação do provedor.');
  if (patient.whatsappConsent !== true) fail(400, 'Registre a autorização do paciente para receber mensagens.');
  const to = normalizeWhatsAppPhone(patient.phone);
  if (!['appointment', 'text'].includes(body.kind)) fail(400, 'Tipo de mensagem inválido.');
  const appointment = body.kind === 'appointment' ? db.data.appointments.find(a => a.id === body.appointmentId && a.patient === patient.id) : null;
  if (body.kind === 'appointment' && (!appointment || appointment.status === 'Cancelada')) fail(400, 'Selecione uma consulta válida deste paciente.');
  if (body.kind === 'appointment' && !status.templateConfigured) fail(503, 'O recurso de lembrete de consulta ainda não está configurado.');
  const text = body.kind === 'text' && typeof body.text === 'string' ? body.text.trim() : '';
  if (body.kind === 'text' && (!text || text.length > 2000)) fail(400, 'Escreva uma mensagem de até 2.000 caracteres.');
  if (body.kind === 'text' && configured.requiresSessionWindow && !(Date.now() - (db.whatsapp?.lastInbound?.[patient.id] || 0) < 86400000)) fail(400, 'O provedor exige uma mensagem recebida do paciente nas últimas 24 horas.');
  const now = Date.now();
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([patient.id, body.kind, appointment?.id, text])))), b => b.toString(16).padStart(2, '0')).join('');
  const messages = db.whatsapp?.messages || [];
  if (messages.some(m => m.fingerprint === fingerprint && m.createdAt > now - 60000 && m.status !== 'failed')) fail(409, 'Esta solicitação já foi registrada. Confira o histórico antes de repetir.');
  if (messages.filter(m => m.createdBy === user.id && m.createdAt > now - 60000).length >= 5) fail(429, 'Aguarde um minuto antes de solicitar mais mensagens.');
  const entry = { id: crypto.randomUUID(), patientId: patient.id, kind: body.kind, status: 'unknown', createdAt: now, createdBy: user.id, fingerprint };
  db.whatsapp = { ...db.whatsapp, messages: [...messages.slice(-499), entry] };
  // Persist intent before the external side effect. Never retry uncertain sends automatically.
  commit(); checkpoint();
  let result;
  try {
    result = await provider.send({ to, kind: body.kind, text, patientName: patient.name, appointment: appointment ? { date: appointment.date, time: appointment.time } : null });
    if (!result || typeof result.messageId !== 'string' || !result.messageId.trim() || result.messageId.length > 200) throw new Error('Missing message id');
  } catch {
    return { id: entry.id, status: 'unknown', message: 'Não foi possível confirmar o resultado. Confira o provedor antes de repetir.' };
  }
  entry.messageId = result.messageId.trim();
  entry.status = 'accepted';
  commit(); checkpoint();
  return { id: entry.id, messageId: entry.messageId, status: 'accepted' };
}

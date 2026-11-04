// Executar no servidor/agendador, usando seu gerenciador de secrets ou --env-file.
const secret = process.env.REMINDER_SCHEDULER_SECRET;
const base = process.env.APP_URL;
if (!secret || !base)
  throw new Error(
    'Configure APP_URL e REMINDER_SCHEDULER_SECRET no agendador.',
  );
const url = new URL('/api/reminders/run', base);
if (
  url.protocol !== 'https:' &&
  !(
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname)
  )
)
  throw new Error('Use HTTPS no agendador de produção.');
const response = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}` },
  redirect: 'error',
  signal: AbortSignal.timeout(55000),
});
if (!response.ok)
  throw new Error(
    `Agendador retornou HTTP ${response.status}. Confira a configuração e a disponibilidade do servidor.`,
  );
const result = await response.json();
console.log(
  JSON.stringify({
    checked: result.checked,
    queued: result.queued,
    pushTransport: result.pushTransport,
  }),
);

import { createECDH } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import {
  pushConfiguration,
  createPushSender,
} from '@/modules/reminders/push-transport';
import { allowedPushEndpoint } from '@/modules/reminders/push-contracts';
vi.mock('web-push', () => ({ default: { sendNotification: vi.fn() } }));
function keys() {
  const key = createECDH('prime256v1');
  key.generateKeys();
  const raw = key.getPrivateKey();
  const privateKey = Buffer.alloc(32);
  raw.copy(privateKey, 32 - raw.length);
  return {
    publicKey: key.getPublicKey().toString('base64url'),
    privateKey: privateKey.toString('base64url'),
  };
}
const config = {
  ...keys(),
  subject: 'mailto:test@example.com',
};
const sub = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/TEST',
  vapidPublicKey: config.publicKey,
  keys: {
    p256dh: config.publicKey,
    auth: Buffer.alloc(16).toString('base64url'),
  },
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('valida par VAPID e contato sem disponibilizar configuração parcial', () => {
  vi.stubEnv('NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY', '');
  expect(pushConfiguration()).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY', config.publicKey);
  vi.stubEnv('WEB_PUSH_PRIVATE_KEY', config.privateKey);
  vi.stubEnv('WEB_PUSH_SUBJECT', config.subject);
  expect(pushConfiguration()).toEqual(config);
  vi.stubEnv('WEB_PUSH_PRIVATE_KEY', keys().privateKey);
  expect(pushConfiguration()).toBeNull();
  vi.stubEnv('WEB_PUSH_PRIVATE_KEY', config.privateKey);
  vi.stubEnv('WEB_PUSH_SUBJECT', 'http://localhost');
  expect(pushConfiguration()).toBeNull();
});
it.each([
  'http://fcm.googleapis.com/x',
  'https://127.0.0.1/x',
  'https://fcm.googleapis.com.evil.test/x',
  'https://fcm.googleapis.com:8443/x',
  'https://user@fcm.googleapis.com/x',
  'https://fcm.googleapis.com/x#secret',
])('bloqueia saída não autorizada: %s', (endpoint) =>
  expect(allowedPushEndpoint(endpoint)).toBe(false),
);
it.each([
  'https://fcm.googleapis.com/fcm/send/x',
  'https://updates.push.services.mozilla.com/wpush/v2/x',
  'https://web.push.apple.com/x',
  'https://wns2.notify.windows.com/x',
  'https://wns2.notify.windows.com/?token=TEST',
])('aceita provedor: %s', (endpoint) =>
  expect(allowedPushEndpoint(endpoint)).toBe(true),
);
it('envia com prazo e texto interno, sem alterar configuração global da biblioteca', async () => {
  vi.mocked(webpush.sendNotification).mockResolvedValue({
    statusCode: 201,
    headers: {},
    body: '',
  });
  expect(
    await createPushSender(config)(sub, '{"type":"REVIEW_RECEIVABLES"}'),
  ).toEqual({ statusCode: 201 });
  expect(webpush.sendNotification).toHaveBeenCalledWith(
    { endpoint: sub.endpoint, keys: sub.keys },
    '{"type":"REVIEW_RECEIVABLES"}',
    expect.objectContaining({
      TTL: 86400,
      timeout: 10000,
      vapidDetails: config,
    }),
  );
});
it('inscrição expirada e falha remota não expõem corpo ou credenciais', async () => {
  vi.mocked(webpush.sendNotification).mockRejectedValue({
    statusCode: 410,
    body: 'SECRET',
  });
  expect(await createPushSender(config)(sub, '{}')).toEqual({
    statusCode: 410,
  });
  vi.mocked(webpush.sendNotification).mockRejectedValue(
    new Error('SECRET ENDPOINT'),
  );
  await expect(createPushSender(config)(sub, '{}')).rejects.toThrow(
    'temporariamente indisponível',
  );
});
it('troca de chave ou endpoint inválido não inicia pedido remoto', async () => {
  expect(
    await createPushSender(config)({ ...sub, vapidPublicKey: 'old' }, '{}'),
  ).toEqual({ statusCode: 410 });
  expect(
    await createPushSender(config)(
      { ...sub, endpoint: 'https://localhost/x' },
      '{}',
    ),
  ).toEqual({ statusCode: 410 });
  expect(webpush.sendNotification).not.toHaveBeenCalled();
});

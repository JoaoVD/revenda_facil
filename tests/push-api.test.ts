import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  active: vi.fn(),
  test: vi.fn(),
  config: vi.fn(),
  sender: vi.fn(),
}));
vi.mock('@/modules/auth/server', () => ({ requireActor: mock.actor }));
vi.mock('@/modules/reminders/push-transport', () => ({
  pushConfiguration: mock.config,
  createPushSender: () => mock.sender,
}));
vi.mock('@/modules/reminders/subscriptions', async () => {
  const { BusinessError } = await import('@/lib/errors');
  return {
    savePushSubscription: mock.save,
    removePushSubscription: mock.remove,
    pushSubscriptionActive: mock.active,
    testPushSubscription: mock.test,
    PushCooldown: class extends BusinessError {},
  };
});
import { GET, POST } from '@/app/api/push/route';
import { PushCooldown } from '@/modules/reminders/subscriptions';
const actor = { userId: 'TEST_USER', organizationId: 'TEST_ORG' };
function request(data: unknown, origin = 'https://revenda.test') {
  return new Request('https://revenda.test/api/push', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}
beforeEach(() => {
  vi.stubEnv('APP_URL', 'https://revenda.test');
  mock.actor.mockResolvedValue({ ...actor, organization: { private: true } });
  mock.config.mockReturnValue({
    publicKey: 'PUBLIC',
    privateKey: 'SECRET',
    subject: 'mailto:test@example.com',
  });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it('configuração pública não retorna a chave privada', async () => {
  const response = await GET();
  expect(await response.json()).toEqual({
    configured: true,
    publicKey: 'PUBLIC',
  });
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('origem inválida é recusada antes de autenticar ou alterar inscrições', async () => {
  expect(
    (await POST(request({ action: 'subscribe' }, 'https://evil.test'))).status,
  ).toBe(403);
  expect(mock.actor).not.toHaveBeenCalled();
  expect(mock.save).not.toHaveBeenCalled();
});
it('sessão expirada responde 401 e não envia teste', async () => {
  mock.actor.mockRejectedValue({ digest: 'NEXT_REDIRECT;replace;/login;307;' });
  expect((await POST(request({ action: 'test' }))).status).toBe(401);
  expect(mock.test).not.toHaveBeenCalled();
});
it('organização do cliente é ignorada: inscrição usa somente o ator autenticado', async () => {
  const subscription = { endpoint: 'TEST', keys: {} };
  expect(
    (
      await POST(
        request({ action: 'subscribe', subscription, organizationId: 'OTHER' }),
      )
    ).status,
  ).toBe(200);
  expect(mock.save).toHaveBeenCalledWith(actor, subscription, 'PUBLIC');
});
it('desativação funciona sem credenciais de envio', async () => {
  mock.config.mockReturnValue(null);
  expect(
    (await POST(request({ action: 'unsubscribe', endpoint: 'TEST' }))).status,
  ).toBe(200);
  expect(mock.remove).toHaveBeenCalledWith(actor, 'TEST');
  expect(
    (await POST(request({ action: 'test', endpoint: 'TEST' }))).status,
  ).toBe(503);
});
it('teste é aceito como envio ao provedor, nunca como confirmação de entrega', async () => {
  const response = await POST(request({ action: 'test', endpoint: 'TEST' }));
  expect(response.status).toBe(202);
  expect((await response.json()).message).toContain('serviço de notificações');
});
it('limite de teste responde 429 e erro remoto é sanitizado', async () => {
  mock.test.mockRejectedValueOnce(new PushCooldown('Aguarde um minuto.'));
  expect((await POST(request({ action: 'test' }))).status).toBe(429);
  mock.test.mockRejectedValueOnce(new Error('SECRET PRIVATE ENDPOINT'));
  const response = await POST(request({ action: 'test' }));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('SECRET');
});

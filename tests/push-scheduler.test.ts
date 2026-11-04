import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  schedule: vi.fn(),
  dispatch: vi.fn(),
  config: vi.fn(),
  send: vi.fn(),
}));
vi.mock('@/modules/reminders/service', () => ({
  scheduleReminders: mock.schedule,
  dispatchPushJobs: mock.dispatch,
}));
vi.mock('@/modules/reminders/push-transport', () => ({
  pushConfiguration: mock.config,
  createPushSender: () => mock.send,
}));
import { POST } from '@/app/api/reminders/run/route';
const request = (secret = 'TEST_SECRET') =>
  new Request('https://revenda.test/api/reminders/run', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
beforeEach(() => {
  vi.stubEnv('REMINDER_SCHEDULER_SECRET', 'TEST_SECRET');
  mock.config.mockReturnValue({ publicKey: 'PUBLIC' });
  mock.schedule.mockResolvedValue({ checked: 1, queued: 1 });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it('sem segredo não executa trabalhos', async () => {
  vi.stubEnv('REMINDER_SCHEDULER_SECRET', '');
  expect((await POST(request())).status).toBe(503);
  expect(mock.schedule).not.toHaveBeenCalled();
});
it('segredo incorreto não agenda nem envia', async () => {
  expect((await POST(request('WRONG'))).status).toBe(401);
  expect(mock.dispatch).not.toHaveBeenCalled();
});
it('VAPID ausente é configuração pendente, nunca envio simulado', async () => {
  mock.config.mockReturnValue(null);
  expect((await POST(request())).status).toBe(503);
  expect(mock.dispatch).not.toHaveBeenCalled();
});
it('rodada autenticada agenda e despacha com transporte real', async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    checked: 1,
    queued: 1,
    pushTransport: 'WEB_PUSH',
  });
  expect(mock.dispatch).toHaveBeenCalledWith(mock.send);
});
it('falha na rodada não vaza dados técnicos', async () => {
  mock.dispatch.mockRejectedValue(new Error('PRIVATE_SECRET'));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('PRIVATE_SECRET');
});

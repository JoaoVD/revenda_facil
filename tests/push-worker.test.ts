import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
function worker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const show = vi.fn(async () => {}),
    open = vi.fn(async () => {});
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://revenda.test' },
      addEventListener: (type: string, callback: (event: unknown) => void) => {
        listeners[type] = callback;
      },
      registration: { showNotification: show },
      clients: { openWindow: open, matchAll: async () => [] },
    },
  });
  return { listeners, show, open };
}
it('payload remoto não consegue exibir nomes, valores ou URLs arbitrárias', async () => {
  const { listeners, show, open } = worker();
  let promise: Promise<void> | undefined;
  listeners.push({
    data: {
      json: () => ({
        name: 'SECRET CUSTOMER',
        body: 'R$ 999',
        url: 'https://evil.test',
      }),
    },
    waitUntil: (p: Promise<void>) => {
      promise = p;
    },
  });
  await promise;
  expect(JSON.stringify(show.mock.calls)).not.toContain('SECRET');
  expect(JSON.stringify(show.mock.calls)).not.toContain('999');
  listeners.notificationclick({
    notification: { close() {}, data: { url: 'https://evil.test' } },
    waitUntil: (p: Promise<void>) => {
      promise = p;
    },
  });
  await promise;
  expect(open).toHaveBeenCalledWith('/receber');
});
it('teste tem texto fixo próprio e encaminha para as configurações', async () => {
  const { listeners, show } = worker();
  let promise: Promise<void> | undefined;
  listeners.push({
    data: { json: () => ({ type: 'TEST_NOTIFICATION' }) },
    waitUntil: (p: Promise<void>) => {
      promise = p;
    },
  });
  await promise;
  expect(show).toHaveBeenCalledWith(
    'Revenda Fácil',
    expect.objectContaining({
      tag: 'push-test',
      data: { url: '/configuracoes' },
    }),
  );
});

import { afterEach, expect, test, vi } from 'vitest';
import { trustedMutationOrigin } from '@/modules/shared/request-origin';
afterEach(() => vi.unstubAllEnvs());
test('origem pública canônica funciona quando URL interna do Next difere', () => {
  vi.stubEnv('APP_URL', 'https://revenda.example');
  const request = new Request('http://localhost:3000/api/sync', {
    headers: { origin: 'https://revenda.example' },
  });
  expect(trustedMutationOrigin(request)).toBe(true);
  expect(
    trustedMutationOrigin(
      new Request(request.url, {
        headers: { origin: 'https://outro.example' },
      }),
    ),
  ).toBe(false);
});

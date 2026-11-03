import { afterEach, expect, test, vi } from 'vitest';
const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  error: false,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set() {} }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.error }),
    },
  }),
}));
import { authConfigured, requireUser } from '@/modules/auth/server';
afterEach(() => {
  state.user = null;
  state.error = false;
  vi.unstubAllEnvs();
});
test('APP_MODE antigo não substitui a configuração Supabase', () => {
  vi.stubEnv('APP_MODE', 'local');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
  expect(authConfigured()).toBe(false);
});
test('visitante sem configuração ou sessão é enviado ao login', async () => {
  vi.stubEnv('APP_MODE', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  await expect(requireUser()).rejects.toThrow('redirect:/login');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
  await expect(requireUser()).rejects.toThrow('redirect:/login');
});
test('somente identidade validada pelo Supabase concede acesso', async () => {
  vi.stubEnv('APP_MODE', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
  state.user = { id: 'supabase-user' };
  expect(await requireUser()).toEqual(state.user);
  state.error = true;
  await expect(requireUser()).rejects.toThrow('redirect:/login');
});

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    // Mesmo limite do servidor (sem importar next/headers no proxy).
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)])
            : AbortSignal.timeout(8_000),
        }),
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // Só renova cookies. Se o Supabase falhar ou demorar, a página segue e a
  // própria rota decide (ex.: levar ao login) em vez de travar aqui.
  await client.auth.getUser().catch(() => undefined);
  return response;
}
export const config = {
  // Arquivos públicos não carregam sessão nem precisam renovar cookies.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|icon\\.svg$|icon-192\\.png$|icon-512\\.png$|apple-touch-icon\\.png$).*)',
  ],
};

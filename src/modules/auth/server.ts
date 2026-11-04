import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
export const authConfigured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
export async function supabase() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server component: Proxy refreshes cookies. */
          }
        },
      },
    },
  );
}
// Deduplicação apenas durante a mesma renderização RSC; nunca cache global de sessão.
export const requireUser = cache(async function requireUser() {
  if (!authConfigured()) redirect('/login');
  const client = await supabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect('/login');
  return data.user;
});
export const requireActor = cache(async function requireActor() {
  const user = await requireUser();
  const membership = await db.membership.findUnique({
    where: { userId: user.id },
    include: { organization: true },
  });
  if (!membership) redirect('/onboarding');
  return {
    userId: user.id,
    organizationId: membership.organizationId,
    organization: membership.organization,
  };
});

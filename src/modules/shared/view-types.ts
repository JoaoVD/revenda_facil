import type { requireActor } from '@/modules/auth/server';
export type ViewProps = {
  actor: Awaited<ReturnType<typeof requireActor>>;
  query: { page: number; q?: string };
};

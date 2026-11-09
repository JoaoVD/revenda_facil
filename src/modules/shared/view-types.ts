import type { ListParams } from '@/components/list-tools';
import type { requireActor } from '@/modules/auth/server';
export type ViewProps = {
  actor: Awaited<ReturnType<typeof requireActor>>;
  query: { page: number; q?: string; params: ListParams };
};

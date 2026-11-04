import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActor } from '@/modules/auth/server';
import { db } from '@/lib/db';
import { Card, PageTitle, Empty } from '@/components/ui';
import { id } from '@/modules/shared/contracts';
import { conflictReview } from '@/modules/sync/resolution';
import { ResolutionForm } from '@/modules/sync/resolution-form';
import { commandLabels } from '@/modules/sync/resolution-contracts';
export default async function Conflicts({
  searchParams,
}: {
  searchParams: Promise<{ command?: string; page?: string }>;
}) {
  const actor = await requireActor(),
    query = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const pending = await db.syncCommand.findMany({
    where: {
      organizationId: actor.organizationId,
      userId: actor.userId,
      status: { in: ['ATTENTION', 'WAITING'] },
    },
    select: { id: true, type: true, message: true },
    orderBy: { receivedAt: 'asc' },
    take: 25,
    skip: (Math.trunc(page) - 1) * 25,
  });
  const selected = query.command || pending[0]?.id;
  if (selected && !id.safeParse(selected).success) notFound();
  const exists = selected
    ? await db.syncCommand.findFirst({
        where: {
          id: selected,
          organizationId: actor.organizationId,
          userId: actor.userId,
        },
        select: { id: true },
      })
    : null;
  if (selected && !exists) notFound();
  const review = exists ? await conflictReview(actor, exists.id) : null;
  return (
    <>
      <PageTitle
        title="Pendências de sincronização"
        description="Confira registros capturados no aparelho sem apagar seu histórico."
      />
      <div className="split-layout">
        <Card>
          <h2>Registros para conferir</h2>
          {!pending.length && <Empty>Nenhuma pendência nesta página.</Empty>}
          <div className="stack">
            {pending.map((c) => (
              <Link
                key={c.id}
                className="small-button"
                href={`/pendencias?command=${c.id}&page=${page}`}
              >
                {commandLabels[c.type] || 'Registro'} ·{' '}
                {c.message || 'Aguardando conferência'}
              </Link>
            ))}
          </div>
          <nav className="ux-actions" aria-label="Páginas das pendências">
            {page > 1 && (
              <Link href={`/pendencias?page=${page - 1}`}>Anterior</Link>
            )}
            {pending.length === 25 && (
              <Link href={`/pendencias?page=${page + 1}`}>Próxima</Link>
            )}
          </nav>
        </Card>
        <Card>
          {review ? (
            <ResolutionForm
              key={`${review.id}:${review.revision}:${review.status}`}
              review={review}
            />
          ) : (
            <Empty>
              Quando houver algo a conferir, os detalhes aparecerão aqui.
            </Empty>
          )}
        </Card>
      </div>
    </>
  );
}

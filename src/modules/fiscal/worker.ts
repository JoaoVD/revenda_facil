import { db } from '@/lib/db';
import {
  reconcileFiscal,
  archiveFiscalFiles,
  dispatchCancellation,
} from './service';

// Consulta somente solicitações já enviadas. Nunca transmite READY automaticamente.
export async function pollFiscalRequests(
  transport?: Parameters<typeof reconcileFiscal>[2],
) {
  const requests = await db.fiscalRequest.findMany({
    where: {
      provider: 'FOCUS',
      nextPollAt: { lte: new Date() },
      AND: [
        { OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
        {
          OR: [
            {
              status: {
                in: ['SENDING', 'PROCESSING', 'UNKNOWN', 'CANCEL_REQUESTED'],
              },
            },
            {
              status: { in: ['AUTHORIZED', 'CANCELLED'] },
              OR: [{ xmlArchivedAt: null }, { pdfArchivedAt: null }],
            },
            { status: 'CANCELLED', cancelXmlArchivedAt: null },
          ],
        },
      ],
    },
    orderBy: { nextPollAt: 'asc' },
    take: 10,
  });
  for (const request of requests) {
    const claimed = await db.fiscalRequest.updateMany({
      where: { id: request.id, nextPollAt: request.nextPollAt },
      data: { nextPollAt: new Date(Date.now() + 120000) },
    });
    if (!claimed.count) continue;
    const actor = {
      organizationId: request.organizationId,
      userId: 'FISCAL_WORKER',
    };
    try {
      if (
        request.status === 'CANCEL_REQUESTED' &&
        request.cancelPhase === 'PREPARED'
      )
        await dispatchCancellation(actor, request.id, transport);
      else if (!['AUTHORIZED', 'CANCELLED'].includes(request.status))
        await reconcileFiscal(actor, request.id, transport);
      await archiveFiscalFiles(actor, request.id, transport);
    } catch {
      /* Estado persistido permanece pendente; consulta manual continua disponível. */
    }
  }
}

export function startFiscalPolling() {
  const state = globalThis as typeof globalThis & {
    fiscalPollTimer?: ReturnType<typeof setInterval>;
  };
  if (state.fiscalPollTimer) return;
  let running = false;
  const poll = async () => {
    if (running || !process.env.FOCUS_NFE_TOKEN) return;
    running = true;
    try {
      await pollFiscalRequests();
    } catch {
      console.error('fiscal_poll_failed');
    } finally {
      running = false;
    }
  };
  state.fiscalPollTimer = setInterval(() => {
    void poll();
  }, 30000);
  state.fiscalPollTimer.unref();
  void poll();
}

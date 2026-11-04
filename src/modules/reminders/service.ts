import { z } from 'zod';
import { db } from '@/lib/db';
import { D } from '@/lib/money';
import { BusinessError } from '@/lib/errors';
import { atomic } from '@/modules/shared/transaction';
import type { Actor } from '@/modules/shared/contracts';
import { businessDate, reminderPeriod } from './policy';
const preferences = z.object({
  enabled: z.boolean(),
  dayMode: z.enum(['FIRST', 'LAST', 'SPECIFIC']),
  day: z.coerce.number().int().min(1).max(31),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  scope: z.enum(['ALL', 'OVERDUE']),
});
export async function saveReminder(actor: Actor, raw: unknown) {
  const data = preferences.parse(raw);
  return atomic(async (tx) => {
    const result = await tx.reminderPreference.upsert({
      where: { organizationId: actor.organizationId },
      create: { ...data, organizationId: actor.organizationId },
      update: data,
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'SETTINGS',
        description: 'Preferências de lembretes atualizadas',
      },
    });
    return result;
  });
}
export async function hasReceivables(
  organizationId: string,
  scope: string,
  now = new Date(),
) {
  const sales = await db.sale.findMany({
    where: { organizationId, status: 'CONFIRMED' },
    include: { payments: true, installments: true },
  });
  const date = businessDate(now),
    today = `${date.period}-${String(date.day).padStart(2, '0')}`;
  return sales.some(
    (s) =>
      D(s.total.toString()).gt(
        s.payments.reduce((sum, p) => sum.plus(p.amount.toString()), D(0)),
      ) &&
      (scope === 'ALL' ||
        s.installments.some(
          (p) =>
            p.dueDate &&
            p.dueDate < today &&
            D(p.received.toString()).lt(p.amount.toString()),
        )),
  );
}
export async function dueNotice(organizationId: string, now = new Date()) {
  const preference = await db.reminderPreference.findUnique({
    where: { organizationId },
  });
  if (!preference) return null;
  const period = reminderPeriod(preference, now);
  if (!period || !(await hasReceivables(organizationId, preference.scope, now)))
    return null;
  // Upsert com update vazio pode virar leitura + criação no Prisma. Dois
  // aparelhos disputam a chave mensal; reutilizar o retry transacional P2002.
  const notice = await atomic((tx) =>
    tx.reminderNotice.upsert({
      where: { organizationId_period: { organizationId, period } },
      create: { organizationId, period },
      update: {},
    }),
  );
  if (notice.reviewedAt || (notice.snoozedUntil && notice.snoozedUntil > now))
    return null;
  return notice;
}
export async function reviewNotice(actor: Actor, raw: unknown) {
  const data = z
    .object({
      noticeId: z.string().uuid(),
      action: z.enum(['REVIEW', 'SNOOZE']),
    })
    .parse(raw);
  const changed = await db.reminderNotice.updateMany({
    where: { id: data.noticeId, organizationId: actor.organizationId },
    data:
      data.action === 'REVIEW'
        ? { reviewedAt: new Date() }
        : { snoozedUntil: new Date(Date.now() + 86400000) },
  });
  if (!changed.count) throw new BusinessError('Aviso não encontrado.');
}
export async function scheduleReminders(now = new Date()) {
  const settings = await db.reminderPreference.findMany({
    where: { enabled: true },
  });
  let queued = 0;
  for (const setting of settings) {
    const notice = await dueNotice(setting.organizationId, now);
    if (!notice) continue;
    const subscriptions = await db.pushSubscription.findMany({
      where: { organizationId: setting.organizationId },
    });
    for (const sub of subscriptions) {
      // Associação só é válida enquanto a Membership ainda corresponde.
      if (
        !(await db.membership.findFirst({
          where: { userId: sub.userId, organizationId: sub.organizationId },
        }))
      )
        continue;
      const result = await db.pushJob.createMany({
        data: [{ subscriptionId: sub.id, noticeId: notice.id }],
        skipDuplicates: true,
      });
      queued += result.count;
    }
  }
  return { checked: settings.length, queued };
}
export type PushSender = (
  subscription: { endpoint: string; keys: unknown },
  payload: string,
) => Promise<{ statusCode: number }>;
/** Adaptador de transporte injetável: nenhum envio remoto habilitado sem integração. */
export async function dispatchPushJobs(send: PushSender, now = new Date()) {
  const jobs = await db.pushJob.findMany({
    where: {
      status: 'PENDING',
      nextAttemptAt: { lte: now },
      attempts: { lt: 5 },
    },
    include: { subscription: true },
    take: 100,
  });
  for (const job of jobs) {
    const lease = await db.pushJob.updateMany({
      where: {
        id: job.id,
        status: 'PENDING',
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        leaseUntil: new Date(now.getTime() + 60000),
        attempts: { increment: 1 },
      },
    });
    if (!lease.count) continue;
    const notice = await dueNotice(job.subscription.organizationId, now);
    if (
      !notice ||
      notice.id !== job.noticeId ||
      !(await db.membership.findFirst({
        where: {
          userId: job.subscription.userId,
          organizationId: job.subscription.organizationId,
        },
      }))
    ) {
      await db.pushJob.update({
        where: { id: job.id },
        data: { status: 'SUPPRESSED', leaseUntil: null },
      });
      continue;
    }
    try {
      const result = await send(
        { endpoint: job.subscription.endpoint, keys: job.subscription.keys },
        JSON.stringify({ type: 'REVIEW_RECEIVABLES' }),
      );
      if ([404, 410].includes(result.statusCode)) {
        await db.pushSubscription.delete({ where: { id: job.subscriptionId } });
        continue;
      }
      if (result.statusCode < 200 || result.statusCode >= 300)
        throw new Error('push_failed');
      await db.pushJob.update({
        where: { id: job.id },
        data: { status: 'SENT', leaseUntil: null },
      });
    } catch {
      await db.pushJob.update({
        where: { id: job.id },
        data: {
          status: job.attempts >= 4 ? 'ATTENTION' : 'PENDING',
          leaseUntil: null,
          nextAttemptAt: new Date(now.getTime() + 60000 * 2 ** job.attempts),
        },
      });
    }
  }
}

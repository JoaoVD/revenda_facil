import { db } from '@/lib/db';
import { BusinessError } from '@/lib/errors';
import { atomic } from '@/modules/shared/transaction';
import type { Actor } from '@/modules/shared/contracts';
import { pushEndpoint, pushSubscriptionInput } from './push-contracts';
import type { PushConfiguration } from './push-transport';
import type { PushSender } from './service';

export class PushCooldown extends BusinessError {}
export async function savePushSubscription(
  actor: Actor,
  raw: unknown,
  publicKey: string,
) {
  const input = pushSubscriptionInput.parse(raw);
  return atomic(async (tx) => {
    const old = await tx.pushSubscription.findUnique({
      where: { endpoint: input.endpoint },
    });
    if (
      old &&
      (old.userId !== actor.userId ||
        old.organizationId !== actor.organizationId)
    )
      throw new BusinessError(
        'Reative as notificações deste navegador para vincular à conta atual.',
      );
    if (!old && (await tx.pushSubscription.count({ where: actor })) >= 10)
      throw new BusinessError(
        'Limite de dez aparelhos. Desative um aparelho antes de cadastrar outro.',
      );
    return tx.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { ...actor, ...input, vapidPublicKey: publicKey },
      update: { keys: input.keys, vapidPublicKey: publicKey },
    });
  });
}
export async function pushSubscriptionActive(
  actor: Actor,
  raw: unknown,
  publicKey: string,
) {
  const endpoint = pushEndpoint.parse(raw);
  return Boolean(
    await db.pushSubscription.findFirst({
      where: { ...actor, endpoint, vapidPublicKey: publicKey },
    }),
  );
}
export async function removePushSubscription(actor: Actor, raw: unknown) {
  const endpoint = pushEndpoint.parse(raw);
  await db.pushSubscription.deleteMany({ where: { ...actor, endpoint } });
}
export async function testPushSubscription(
  actor: Actor,
  raw: unknown,
  send: PushSender,
  config: PushConfiguration,
) {
  const endpoint = pushEndpoint.parse(raw);
  const sub = await db.pushSubscription.findFirst({
    where: { ...actor, endpoint, vapidPublicKey: config.publicKey },
  });
  if (!sub)
    throw new BusinessError(
      'Ative as notificações neste aparelho antes de testar.',
    );
  const now = new Date();
  const claim = await db.pushSubscription.updateMany({
    where: {
      id: sub.id,
      ...actor,
      OR: [
        { lastTestAt: null },
        { lastTestAt: { lte: new Date(now.getTime() - 60000) } },
      ],
    },
    data: { lastTestAt: now },
  });
  if (!claim.count)
    throw new PushCooldown('Aguarde um minuto antes de enviar outro teste.');
  const result = await send(sub, JSON.stringify({ type: 'TEST_NOTIFICATION' }));
  if ([404, 410].includes(result.statusCode)) {
    await removePushSubscription(actor, endpoint);
    throw new BusinessError(
      'Inscrição expirada. Desative e ative novamente neste aparelho.',
    );
  }
  if (result.statusCode < 200 || result.statusCode >= 300)
    throw new Error('push_unavailable');
}

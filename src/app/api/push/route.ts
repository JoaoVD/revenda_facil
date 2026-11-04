import { z } from 'zod';
import { requireActor } from '@/modules/auth/server';
import { BusinessError } from '@/lib/errors';
import { trustedMutationOrigin } from '@/modules/shared/request-origin';
import {
  createPushSender,
  pushConfiguration,
} from '@/modules/reminders/push-transport';
import {
  savePushSubscription,
  pushSubscriptionActive,
  removePushSubscription,
  testPushSubscription,
  PushCooldown,
} from '@/modules/reminders/subscriptions';
const headers = { 'Cache-Control': 'private, no-store' };
const actionInput = z.object({
  action: z.enum(['status', 'subscribe', 'unsubscribe', 'test']),
  subscription: z.unknown().optional(),
  endpoint: z.unknown().optional(),
});
async function actor() {
  const current = await requireActor();
  return { userId: current.userId, organizationId: current.organizationId };
}
function failure(error: unknown) {
  const expired =
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string' &&
    error.digest.startsWith('NEXT_REDIRECT');
  const status = expired
    ? 401
    : error instanceof PushCooldown
      ? 429
      : error instanceof BusinessError ||
          error instanceof z.ZodError ||
          error instanceof SyntaxError
        ? 400
        : 503;
  return Response.json(
    {
      message: expired
        ? 'Entre novamente para configurar as notificações.'
        : error instanceof BusinessError
          ? error.message
          : status === 400
            ? 'Confira os dados de inscrição.'
            : 'Não foi possível acessar o serviço de notificações. Tente novamente.',
    },
    { status, headers },
  );
}
export async function GET() {
  try {
    await actor();
    const config = pushConfiguration();
    return Response.json(
      { configured: Boolean(config), publicKey: config?.publicKey || null },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (
    !trustedMutationOrigin(request) ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return Response.json(
      { message: 'Origem inválida.' },
      { status: 403, headers },
    );
  try {
    const who = await actor();
    const text = await request.text();
    if (text.length > 8192)
      return Response.json(
        { message: 'Inscrição muito grande.' },
        { status: 413, headers },
      );
    const input = actionInput.parse(JSON.parse(text));
    if (input.action === 'unsubscribe') {
      await removePushSubscription(who, input.endpoint);
      return Response.json({ ok: true }, { headers });
    }
    const config = pushConfiguration();
    if (!config)
      return Response.json(
        { message: 'Notificações ainda não configuradas no servidor.' },
        { status: 503, headers },
      );
    if (input.action === 'status')
      return Response.json(
        {
          active: await pushSubscriptionActive(
            who,
            input.endpoint,
            config.publicKey,
          ),
        },
        { headers },
      );
    if (input.action === 'subscribe') {
      await savePushSubscription(who, input.subscription, config.publicKey);
      return Response.json({ ok: true }, { headers });
    }
    await testPushSubscription(
      who,
      input.endpoint,
      createPushSender(config),
      config,
    );
    return Response.json(
      {
        ok: true,
        message:
          'Teste enviado ao serviço de notificações. Confira este aparelho.',
      },
      { status: 202, headers },
    );
  } catch (error) {
    return failure(error);
  }
}

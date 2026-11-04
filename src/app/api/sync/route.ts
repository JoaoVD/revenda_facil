import { requireActor } from '@/modules/auth/server';
import { syncCommand } from '@/modules/sync/service';
import { BusinessError, publicError } from '@/lib/errors';
import { db } from '@/lib/db';
import { trustedMutationOrigin } from '@/modules/shared/request-origin';
const headers = { 'Cache-Control': 'private, no-store' };
function authFailure(error: unknown) {
  const expired =
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string' &&
    error.digest.startsWith('NEXT_REDIRECT');
  return Response.json(
    {
      message: expired
        ? 'Entre novamente. As ações permanecem no aparelho.'
        : 'Servidor temporariamente indisponível.',
    },
    { status: expired ? 401 : 503, headers },
  );
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
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    return authFailure(error);
  }
  const body = await request.text();
  if (body.length > 128000)
    return Response.json(
      { message: 'Comando muito grande.' },
      { status: 413, headers },
    );
  try {
    const result = await syncCommand(actor, JSON.parse(body));
    return Response.json(
      {
        id: result.id,
        status: result.status,
        result: result.result,
        message: result.message,
        resolvedPayload: result.resolvedPayload,
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      { message: publicError(error) },
      {
        status:
          error instanceof BusinessError ||
          (error instanceof Error &&
            ['ZodError', 'SyntaxError'].includes(error.name))
            ? 409
            : 503,
        headers,
      },
    );
  }
}
export async function GET() {
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    return authFailure(error);
  }
  // Snapshot completo e limitado nesta versão. Inativações substituem a cópia
  // local; não fingir que este endpoint já é um feed incremental ilimitado.
  const organizationId = actor.organizationId;
  const [products, customers, sales, conflicts, commandResults] =
    await Promise.all([
      db.product.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          sku: true,
          stock: true,
          reserved: true,
          active: true,
          salePrice: true,
          updatedAt: true,
        },
        take: 2000,
        orderBy: { name: 'asc' },
      }),
      db.customer.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          phone: true,
          active: true,
          updatedAt: true,
        },
        take: 2000,
        orderBy: { name: 'asc' },
      }),
      db.sale.findMany({
        where: { organizationId },
        select: {
          id: true,
          customerId: true,
          total: true,
          status: true,
          fulfillmentMode: true,
          fulfillmentStatus: true,
          version: true,
          expectedDate: true,
          items: {
            select: { productName: true, quantity: true, unitPrice: true },
          },
          payments: { select: { id: true, amount: true, direction: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      db.syncCommand.findMany({
        where: {
          organizationId,
          userId: actor.userId,
          status: { in: ['ATTENTION', 'WAITING'] },
        },
        select: { id: true, type: true, message: true, receivedAt: true },
        take: 500,
      }),
      db.syncCommand.findMany({
        where: { organizationId, userId: actor.userId },
        select: {
          id: true,
          status: true,
          message: true,
          result: true,
          resolvedPayload: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
    ]);
  return Response.json(
    {
      userId: actor.userId,
      organizationId,
      owner: actor.organization.ownerName,
      serverAt: new Date().toISOString(),
      products,
      customers,
      sales,
      conflicts,
      commandResults,
      limits: { products: 2000, customers: 2000, sales: 500 },
    },
    { headers },
  );
}

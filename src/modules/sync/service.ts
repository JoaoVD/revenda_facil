import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { BusinessError, publicError } from '@/lib/errors';
import { atomic, hash, sameRequest } from '@/modules/shared/transaction';
import { customerInput, id, type Actor } from '@/modules/shared/contracts';
import { finalizeSale, completeOrder } from '@/modules/sales/service';
import { recordPayment } from '@/modules/finance/service';
import { commandInput } from './contracts';

export async function syncCommand(actor: Actor, raw: unknown) {
  const input = commandInput.parse(raw);
  if (
    input.userId !== actor.userId ||
    input.organizationId !== actor.organizationId
  )
    throw new BusinessError(
      'A conta ou organização não corresponde às ações deste aparelho.',
    );
  // Persistir a informação capturada antes de tentar aplicá-la. Dependências com
  // conflito não impedem a captura de dinheiro ou entrega já realizados.
  const command = await atomic(async (tx) => {
    const old = await tx.syncCommand.findUnique({ where: { id: input.id } });
    if (old) {
      if (
        old.organizationId !== actor.organizationId ||
        old.userId !== actor.userId
      )
        throw new BusinessError('Comando vinculado a outra conta.');
      sameRequest(old.requestHash, input);
      // Destrava apenas a antiga pausa por esgotamento de transporte. Nunca
      // reabre automaticamente conflitos comerciais ou comandos alterados.
      if (
        old.status === 'ATTENTION' &&
        old.attempts >= 8 &&
        old.message ===
          'Limite de tentativas. Informação preservada para conferência.'
      )
        return tx.syncCommand.update({
          where: { id: old.id },
          data: { status: 'PENDING', message: null, leaseUntil: null },
        });
      return old;
    }
    return tx.syncCommand.create({
      data: {
        ...input,
        requestHash: hash(input),
        payload: input.payload as Prisma.InputJsonObject,
        dependencies: input.dependencies,
        capturedAt: new Date(input.capturedAt),
      },
    });
  });
  return applySyncCommand(actor, command.id);
}

/** Aplicação a partir do registro persistido: a resolução não altera o envelope capturado. */
export async function applySyncCommand(actor: Actor, commandId: string) {
  let command = await db.syncCommand.findFirst({
    where: {
      id: commandId,
      organizationId: actor.organizationId,
      userId: actor.userId,
    },
  });
  if (!command) throw new BusinessError('Registro não encontrado nesta conta.');
  if (['APPLIED', 'ATTENTION'].includes(command.status)) return command;
  const input = {
    id: command.id,
    type: commandInput.shape.type.parse(command.type),
    payload: commandInput.shape.payload.parse(
      command.resolvedPayload ?? command.payload,
    ),
    dependencies: commandInput.shape.dependencies.parse(command.dependencies),
  };
  const dependencies = await db.syncCommand.count({
    where: {
      id: { in: input.dependencies },
      organizationId: actor.organizationId,
      userId: actor.userId,
      status: 'APPLIED',
    },
  });
  if (dependencies !== new Set(input.dependencies).size)
    return db.syncCommand.update({
      where: { id: input.id },
      data: {
        status: 'WAITING',
        message:
          'Registro preservado. Aguardando aplicação ou reconciliação do comando anterior.',
      },
    });
  const now = new Date();
  const lease = await db.syncCommand.updateMany({
    where: {
      id: input.id,
      status: { in: ['PENDING', 'WAITING'] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      leaseUntil: new Date(now.getTime() + 60000),
      attempts: { increment: 1 },
      status: 'PENDING',
    },
  });
  if (!lease.count) {
    command = await db.syncCommand.findUniqueOrThrow({
      where: { id: input.id },
    });
    return command;
  }
  try {
    let result: { id: string };
    switch (input.type) {
      case 'ORDER':
        result = await finalizeSale(actor, input.payload);
        break;
      case 'DELIVERY':
        result = await completeOrder(actor, input.payload);
        break;
      case 'PAYMENT':
        result = await recordPayment(actor, input.payload);
        break;
      case 'CUSTOMER': {
        const customerId = id.parse(input.payload.customerId),
          data = customerInput.parse(input.payload);
        result = await atomic(async (tx) => {
          // ID estável recupera uma aplicação cujo retorno foi perdido. O hash
          // do comando impede reutilizar o mesmo comando com outro conteúdo.
          const old = await tx.customer.findFirst({
            where: { id: customerId, organizationId: actor.organizationId },
          });
          if (old) {
            if (
              old.name !== data.name ||
              (old.phone || '') !== data.phone ||
              (old.document || '') !== data.document ||
              (old.email || '') !== data.email ||
              (old.notes || '') !== data.notes
            )
              throw new BusinessError(
                'O identificador do cliente já existe com outros dados. Informação preservada para revisão.',
              );
            return old;
          }
          const customer = await tx.customer.create({
            data: {
              ...data,
              id: customerId,
              organizationId: actor.organizationId,
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId: actor.organizationId,
              actorId: actor.userId,
              type: 'CUSTOMER',
              referenceId: customer.id,
              description: 'Cliente sincronizado do aparelho',
            },
          });
          return customer;
        });
        break;
      }
    }
    return await db.syncCommand.update({
      where: { id: input.id },
      data: {
        status: 'APPLIED',
        result: { id: result.id },
        message: null,
        leaseUntil: null,
      },
    });
  } catch (error) {
    const permanent =
      error instanceof BusinessError ||
      (error instanceof Error && error.name === 'ZodError');
    await db.syncCommand.update({
      where: { id: input.id },
      data: {
        status: permanent ? 'ATTENTION' : 'PENDING',
        leaseUntil: null,
        message: permanent
          ? publicError(error)
          : 'Falha temporária. A informação foi preservada.',
      },
    });
    if (!permanent) throw error;
    return db.syncCommand.findUniqueOrThrow({ where: { id: input.id } });
  }
}

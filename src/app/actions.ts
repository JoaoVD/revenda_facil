'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  requireActor,
  requireUser,
  supabase,
  authConfigured,
} from '@/modules/auth/server';
import { organizationInput } from '@/modules/organizations/validation';
import { createProduct } from '@/modules/products/service';
import { receivePurchase } from '@/modules/purchases/service';
import {
  finalizeSale,
  cancelSale,
  completeOrder,
} from '@/modules/sales/service';
import { recordPayment } from '@/modules/finance/service';
import { customerInput, id } from '@/modules/shared/contracts';
import { atomic } from '@/modules/shared/transaction';
import { BusinessError, publicError } from '@/lib/errors';
import { saveReminder, reviewNotice } from '@/modules/reminders/service';
import { resolveConflict } from '@/modules/sync/resolution';
import { editOrder, refundAndCancel } from '@/modules/orders/changes';
import {
  prepareFiscal,
  sendFiscal,
  reconcileFiscal,
  cancelFiscal,
} from '@/modules/fiscal/service';
import {
  saveFiscalEmitter,
  saveFiscalProduct,
  saveFiscalCustomer,
} from '@/modules/fiscal/configuration';
export type Result = { ok: boolean; message: string; id?: string };
export async function loginAction(_: Result, form: FormData): Promise<Result> {
  if (!authConfigured())
    return {
      ok: false,
      message: 'Configure o Supabase no servidor para habilitar o acesso.',
    };
  const input = z
    .object({ email: z.email(), password: z.string().min(8).max(128) })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return {
      ok: false,
      message: 'Informe e-mail e senha válida (mínimo 8 caracteres).',
    };
  const client = await supabase();
  if (form.get('mode') === 'signup') {
    const { error } = await client.auth.signUp({
      ...input.data,
      options: {
        emailRedirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/login`,
      },
    });
    return {
      ok: !error,
      message: error
        ? 'Não foi possível criar a conta. Verifique os dados e tente novamente.'
        : 'Conta solicitada. Confirme seu e-mail e depois entre com sua senha.',
    };
  }
  const { error } = await client.auth.signInWithPassword(input.data);
  if (error)
    return {
      ok: false,
      message: 'Não foi possível entrar. Confira seu e-mail e senha.',
    };
  redirect('/');
}
export async function logoutAction() {
  const client = await supabase();
  await client.auth.signOut();
  redirect('/login');
}
export async function onboardingAction(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  try {
    const input = organizationInput.parse(Object.fromEntries(form));
    await atomic(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { userId: user.id },
      });
      if (membership)
        throw new BusinessError('Sua operação já está configurada.');
      await tx.organization.create({
        data: {
          ...input,
          memberships: { create: { userId: user.id } },
          fiscalSettings: { create: {} },
        },
      });
    });
  } catch (error) {
    return { ok: false, message: publicError(error) };
  }
  redirect('/');
}
export async function operationAction(
  operation: string,
  raw: unknown,
): Promise<Result> {
  const actor = await requireActor();
  try {
    switch (operation) {
      case 'reminder-settings':
        await saveReminder(actor, raw);
        break;
      case 'reminder-review':
        await reviewNotice(actor, raw);
        break;
      case 'fiscal-emitter':
        await saveFiscalEmitter(actor, raw);
        break;
      case 'fiscal-product':
        await saveFiscalProduct(actor, raw);
        break;
      case 'fiscal-customer':
        await saveFiscalCustomer(actor, raw);
        break;
      case 'fiscal-prepare':
        await prepareFiscal(actor, raw);
        break;
      case 'fiscal-send': {
        const data = z
          .object({ requestId: id, confirmed: z.literal('yes') })
          .parse(raw);
        await sendFiscal(actor, data.requestId);
        break;
      }
      case 'fiscal-consult': {
        const data = z.object({ requestId: id }).parse(raw);
        await reconcileFiscal(actor, data.requestId);
        break;
      }
      case 'fiscal-cancel': {
        const data = z
          .object({ requestId: id, reason: z.string().trim().min(15).max(255) })
          .parse(raw);
        await cancelFiscal(actor, data.requestId, data.reason);
        break;
      }
      case 'product':
        await createProduct(actor, raw);
        break;
      case 'purchase':
        await receivePurchase(actor, raw);
        break;
      case 'sale': {
        const sale = await finalizeSale(actor, raw);
        revalidatePath('/', 'layout');
        return { ok: true, message: 'Pedido confirmado.', id: sale.id };
      }
      case 'cancel':
        await cancelSale(actor, raw);
        break;
      case 'complete-order':
        await completeOrder(actor, raw);
        break;
      case 'payment':
        await recordPayment(actor, raw);
        break;
      case 'edit-order':
        await editOrder(actor, raw);
        break;
      case 'refund-cancel':
        await refundAndCancel(actor, raw);
        break;
      case 'draft-status': {
        const input = z.object({ idempotencyKey: id }).parse(raw);
        const sale = await db.sale.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: actor.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: { id: true },
        });
        return {
          ok: true,
          message: sale ? 'Pedido localizado.' : 'Pedido ainda não confirmado.',
          id: sale?.id,
        };
      }
      case 'resolve-sync': {
        const result = await resolveConflict(actor, raw);
        revalidatePath('/', 'layout');
        return {
          ok: true,
          message:
            result.status === 'APPLIED'
              ? 'Conferência aplicada com sucesso.'
              : 'Decisão registrada. Confira a pendência atualizada antes de continuar.',
        };
      }
      case 'customer': {
        const input = customerInput.parse(raw);
        await atomic(async (tx) => {
          const c = await tx.customer.create({
            data: { ...input, organizationId: actor.organizationId },
          });
          await tx.auditLog.create({
            data: {
              organizationId: actor.organizationId,
              actorId: actor.userId,
              type: 'CUSTOMER',
              description: 'Cliente cadastrado',
              referenceId: c.id,
            },
          });
        });
        break;
      }
      case 'fiscal': {
        const input = z
          .object({
            id,
            status: z.enum([
              'PENDING',
              'ISSUED',
              'AUTHORIZED',
              'REJECTED',
              'CANCELLED',
            ]),
            model: z.enum(['55', '65']),
            accessKey: z.string().regex(/^(\d{44})?$/),
            evidence: z.string().trim().max(500),
          })
          .parse(raw);
        if (input.status !== 'PENDING' && input.evidence.length < 5)
          throw new BusinessError(
            'Informe a origem e a evidência do status fiscal.',
          );
        if (
          ['ISSUED', 'AUTHORIZED', 'CANCELLED'].includes(input.status) &&
          !input.accessKey
        )
          throw new BusinessError('Informe a chave de acesso.');
        await atomic(async (tx) => {
          const updated = await tx.fiscalDocument.updateMany({
            where: {
              id: input.id,
              organizationId: actor.organizationId,
              source: 'ASSISTED',
              activeRequestId: null,
            },
            data: {
              status: input.status,
              model: input.model,
              accessKey: input.accessKey || null,
              evidence: input.evidence,
            },
          });
          if (!updated.count)
            throw new BusinessError('Documento não encontrado.');
          await tx.auditLog.create({
            data: {
              organizationId: actor.organizationId,
              actorId: actor.userId,
              type: 'FISCAL',
              description: `Situação fiscal informada manualmente: ${input.status}`,
              referenceId: input.id,
            },
          });
        });
        break;
      }
      case 'settings': {
        const input = organizationInput.parse(raw);
        await atomic(async (tx) => {
          if (input.cnpj !== actor.organization.cnpj)
            throw new BusinessError(
              'Alteração do CNPJ requer revisão cadastral.',
            );
          await tx.organization.update({
            where: { id: actor.organizationId },
            data: input,
          });
          await tx.auditLog.create({
            data: {
              organizationId: actor.organizationId,
              actorId: actor.userId,
              type: 'SETTINGS',
              description: 'Configurações atualizadas',
            },
          });
        });
        break;
      }
      default:
        throw new BusinessError('Operação não disponível.');
    }
  } catch (error) {
    return { ok: false, message: publicError(error) };
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Pronto! Registro salvo com sucesso.' };
}

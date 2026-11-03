import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { BusinessError } from '@/lib/errors';
import { atomic } from '@/modules/shared/transaction';
import type { Actor } from '@/modules/shared/contracts';
import { type AcbrClient, type AcbrDocument } from './acbr';
import { focusClient } from './focus';
import { toFocusPayload } from './focus-payload';
import { validateFiscalPayload } from './payload';
import { remoteFiscalState, fiscalPayloadHash } from './state';

type Transport = Pick<AcbrClient, 'submit' | 'get' | 'find' | 'download'> & {
  cancel(model: '55' | '65', id: string, reason: string): Promise<unknown>;
} & Partial<Pick<AcbrClient, 'getCancellation' | 'downloadCancellation'>>;
const input = z.object({
  documentId: z.uuid(),
  model: z.enum(['55', '65']),
  payload: z.string().max(200000),
});
function requestTransport(provider: string, transport?: Transport): Transport {
  if (provider !== 'FOCUS')
    throw new BusinessError(
      'Histórico de outro provedor. Não é possível transmiti-lo ou consultá-lo pela Focus.',
    );
  return transport ?? focusClient();
}
export async function prepareFiscal(actor: Actor, raw: unknown) {
  const data = input.parse(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.payload);
  } catch {
    throw new BusinessError('O conteúdo fiscal precisa ser um JSON válido.');
  }
  return atomic(async (tx) => {
    const document = await tx.fiscalDocument.findFirst({
      where: { id: data.documentId, organizationId: actor.organizationId },
      include: { sale: { include: { items: { orderBy: { id: 'asc' } } } } },
    });
    if (!document || document.sale.status !== 'CONFIRMED')
      throw new BusinessError('Venda indisponível para emissão.');
    if (document.source === 'ACBR' && document.activeRequestId)
      throw new BusinessError(
        'Preserve o documento do provedor anterior. Não é possível convertê-lo para Focus nesta venda.',
      );
    if (!['PENDING', 'REJECTED'].includes(document.status))
      throw new BusinessError(
        'Resolva a solicitação fiscal existente antes de preparar outra.',
      );
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
    });
    const sale = document.sale;
    let payload: Record<string, unknown>;
    try {
      payload = validateFiscalPayload(
        parsed,
        {
          id: sale.id,
          total: sale.total.toString(),
          discount: sale.discount.toString(),
          subtotal: sale.subtotal.toString(),
          items: sale.items.map((i) => ({
            ...i,
            unitPrice: i.unitPrice.toString(),
            total: i.total.toString(),
          })),
        },
        org.cnpj,
        data.model,
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BusinessError(
          `Revise os dados fiscais: ${error.issues
            .slice(0, 6)
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`,
        );
      throw new BusinessError(
        error instanceof Error ? error.message : 'Dados fiscais inválidos.',
      );
    }
    const reference = `rf-${randomUUID()}`;
    const ide = (payload.infNFe as { ide: { serie: number; nNF: number } }).ide;
    try {
      payload = toFocusPayload(payload, data.model);
    } catch (error) {
      throw new BusinessError(
        error instanceof Error
          ? error.message
          : 'Operação fiscal não suportada pela integração Focus.',
      );
    }
    payload.referencia = reference;
    const request = await tx.fiscalRequest.create({
      data: {
        organizationId: actor.organizationId,
        documentId: document.id,
        model: data.model,
        provider: 'FOCUS',
        fiscalSeries: ide.serie,
        fiscalNumber: ide.nNF,
        reference,
        payload: payload as Prisma.InputJsonObject,
        requestHash: fiscalPayloadHash(payload),
      },
    });
    await tx.fiscalDocument.update({
      where: { id: document.id },
      data: {
        source: 'FOCUS',
        status: 'READY',
        model: data.model,
        activeRequestId: request.id,
        accessKey: null,
        evidence: null,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'FISCAL',
        referenceId: request.id,
        description: 'Solicitação Focus NFe preparada em homologação',
      },
    });
    return request;
  });
}

async function owned(actor: Actor, requestId: string) {
  z.uuid().parse(requestId);
  const request = await db.fiscalRequest.findFirst({
    where: { id: requestId, organizationId: actor.organizationId },
    include: { document: true },
  });
  if (
    !request ||
    request.document.activeRequestId !== request.id ||
    request.environment !== 'homologacao'
  )
    throw new BusinessError('Solicitação fiscal não encontrada.');
  return request;
}

async function applyRemote(
  actor: Actor,
  requestId: string,
  remote: AcbrDocument,
) {
  const request = await owned(actor, requestId);
  if (
    remote.ambiente !== 'homologacao' ||
    (request.providerId && request.providerId !== remote.id) ||
    (request.accessKey && remote.chave && request.accessKey !== remote.chave) ||
    remote.referencia !== request.reference
  )
    throw new BusinessError(
      'A resposta fiscal não corresponde à solicitação. Consulte o provedor.',
    );
  const status = remoteFiscalState(remote);
  // Resposta atrasada de consulta não pode desfazer estado terminal ou pedido de cancelamento.
  if (
    request.status === 'CANCELLED' ||
    (request.status === 'AUTHORIZED' &&
      !['AUTHORIZED', 'CANCELLED'].includes(status))
  )
    return;
  const finalStatus =
    request.status === 'CANCEL_REQUESTED' && status !== 'CANCELLED'
      ? 'CANCEL_REQUESTED'
      : status;
  await atomic(async (tx) => {
    const changed = await tx.fiscalRequest.updateMany({
      where: {
        id: request.id,
        status: request.status,
        updatedAt: request.updatedAt,
      },
      data: {
        providerId: remote.id,
        status: finalStatus,
        accessKey: remote.chave || request.accessKey,
        protocol: remote.autorizacao?.numero_protocolo || request.protocol,
        leaseUntil: null,
        message:
          finalStatus === 'REJECTED'
            ? 'Documento rejeitado. Consulte os detalhes no provedor antes de corrigir.'
            : finalStatus === 'UNKNOWN'
              ? 'Resposta exige revisão no provedor; o reenvio continua bloqueado.'
              : null,
      },
    });
    if (!changed.count) return;
    await tx.fiscalDocument.updateMany({
      where: { id: request.documentId, activeRequestId: request.id },
      data: {
        status: finalStatus,
        accessKey: remote.chave || request.accessKey,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'FISCAL',
        referenceId: request.id,
        description: `${request.provider} homologação: ${finalStatus}`,
      },
    });
  });
}

export async function sendFiscal(
  actor: Actor,
  requestId: string,
  transport?: Transport,
) {
  const request = await owned(actor, requestId);
  const client = requestTransport(request.provider, transport); // Falta de credenciais não consome a reserva.
  if (fiscalPayloadHash(request.payload) !== request.requestHash)
    throw new BusinessError('O conteúdo da solicitação foi alterado.');
  const reserved = await db.fiscalRequest.updateMany({
    where: { id: request.id, status: 'READY' },
    data: {
      status: 'SENDING',
      attempts: { increment: 1 },
      leaseUntil: new Date(Date.now() + 90000),
    },
  });
  if (!reserved.count)
    throw new BusinessError(
      'Solicitação já enviada. Use Consultar; não reenvie.',
    );
  await db.fiscalDocument.update({
    where: { id: request.documentId },
    data: { status: 'SENDING' },
  });
  try {
    const response = await client.submit(
      request.model as '55' | '65',
      request.payload as Record<string, unknown>,
    );
    await applyRemote(actor, request.id, response);
  } catch {
    await db.fiscalRequest.updateMany({
      where: { id: request.id, status: 'SENDING' },
      data: {
        status: 'UNKNOWN',
        leaseUntil: null,
        message:
          'Resultado do envio não confirmado. Consulte antes de qualquer nova tentativa.',
      },
    });
    await db.fiscalDocument.updateMany({
      where: { id: request.documentId, status: 'SENDING' },
      data: { status: 'UNKNOWN' },
    });
    throw new BusinessError(
      'Envio não confirmado. A solicitação foi preservada; use Consultar.',
    );
  }
}

export async function reconcileFiscal(
  actor: Actor,
  requestId: string,
  transport?: Transport,
) {
  const request = await owned(actor, requestId);
  const client = requestTransport(request.provider, transport);
  if (request.status === 'READY')
    throw new BusinessError('Solicitação ainda não enviada.');
  if (request.leaseUntil && request.leaseUntil > new Date())
    throw new BusinessError('Envio em andamento. Aguarde antes de consultar.');
  const model = request.model as '55' | '65';
  const org = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
  });
  const response = request.providerId
    ? await client.get(model, request.providerId)
    : await client.find(model, org.cnpj, request.reference);
  if (!response)
    throw new BusinessError(
      'Documento não localizado. O resultado continua incerto; não reenvie sem revisão no provedor.',
    );
  await applyRemote(actor, request.id, response);
  if (
    request.status === 'CANCEL_REQUESTED' &&
    request.providerId &&
    client.getCancellation &&
    response.status !== 'cancelado'
  ) {
    const event = await client.getCancellation(model, request.providerId);
    if (
      event.ambiente !== 'homologacao' ||
      event.chave_acesso !== request.accessKey
    )
      throw new BusinessError(
        'Evento de cancelamento incompatível com o documento.',
      );
    if (
      event.status === 'rejeitado' &&
      request.cancelEventId &&
      event.id === request.cancelEventId
    ) {
      await atomic(async (tx) => {
        const changed = await tx.fiscalRequest.updateMany({
          where: {
            id: request.id,
            status: 'CANCEL_REQUESTED',
            cancelAttemptId: request.cancelAttemptId,
            cancelEventId: event.id,
            cancelPhase: 'RESPONDED',
          },
          data: {
            status: 'AUTHORIZED',
            message:
              'Cancelamento rejeitado pelo provedor. Revise o motivo antes de solicitar novamente.',
          },
        });
        if (!changed.count) return;
        await tx.fiscalDocument.updateMany({
          where: {
            id: request.documentId,
            activeRequestId: request.id,
            status: 'CANCEL_REQUESTED',
          },
          data: { status: 'AUTHORIZED' },
        });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            type: 'FISCAL',
            referenceId: request.id,
            description: 'Cancelamento fiscal rejeitado pelo provedor',
          },
        });
      });
    }
  }
}

export async function cancelFiscal(
  actor: Actor,
  requestId: string,
  reason: string,
  transport?: Transport,
) {
  z.string().trim().min(15).max(255).parse(reason);
  const request = await owned(actor, requestId);
  const client = requestTransport(request.provider, transport);
  if (request.status !== 'AUTHORIZED' || !request.providerId)
    throw new BusinessError(
      'Somente documento autorizado pode solicitar cancelamento.',
    );
  await atomic(async (tx) => {
    const changed = await tx.fiscalRequest.updateMany({
      where: { id: request.id, status: 'AUTHORIZED' },
      data: {
        status: 'CANCEL_REQUESTED',
        cancelReason: reason,
        cancelAttemptId: randomUUID(),
        cancelEventId: null,
        cancelPhase: 'PREPARED',
        message:
          'Cancelamento solicitado; aguarde confirmação. Não reenvie em caso de falha de rede.',
      },
    });
    if (!changed.count)
      throw new BusinessError(
        'Cancelamento já solicitado. Consulte o resultado.',
      );
    await tx.fiscalDocument.updateMany({
      where: {
        id: request.documentId,
        activeRequestId: request.id,
        status: 'AUTHORIZED',
      },
      data: { status: 'CANCEL_REQUESTED' },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'FISCAL',
        referenceId: request.id,
        description: `Cancelamento fiscal solicitado: ${reason}`,
      },
    });
  });
  await dispatchCancellation(actor, request.id, client);
}

// PREPARED é comprovadamente anterior à rede. SENDING nunca é reenviado automaticamente.
export async function dispatchCancellation(
  actor: Actor,
  requestId: string,
  transport?: Transport,
) {
  const request = await owned(actor, requestId);
  const client = requestTransport(request.provider, transport);
  if (!request.providerId || !request.cancelReason || !request.cancelAttemptId)
    throw new BusinessError('Pedido de cancelamento incompleto.');
  const claimed = await db.fiscalRequest.updateMany({
    where: {
      id: request.id,
      status: 'CANCEL_REQUESTED',
      cancelPhase: 'PREPARED',
      cancelAttemptId: request.cancelAttemptId,
    },
    data: { cancelPhase: 'SENDING', leaseUntil: new Date(Date.now() + 90000) },
  });
  if (!claimed.count)
    throw new BusinessError('Pedido já transmitido ou em consulta.');
  try {
    const response = await client.cancel(
      request.model as '55' | '65',
      request.providerId,
      request.cancelReason,
    );
    const event = z
      .object({
        id: z.string(),
        status: z.enum(['pendente', 'registrado', 'rejeitado', 'erro']),
        ambiente: z.literal('homologacao'),
        chave_acesso: z.literal(request.accessKey || ''),
      })
      .passthrough()
      .safeParse(response);
    // A resposta direta do DELETE pertence a esta tentativa HTTP; uma consulta
    // posterior sem ID de evento não oferece a mesma correlação.
    if (event.success && event.data.status === 'rejeitado') {
      await atomic(async (tx) => {
        const changed = await tx.fiscalRequest.updateMany({
          where: {
            id: request.id,
            status: 'CANCEL_REQUESTED',
            cancelAttemptId: request.cancelAttemptId,
            cancelPhase: 'SENDING',
          },
          data: {
            status: 'AUTHORIZED',
            cancelPhase: 'RESPONDED',
            cancelEventId: event.data.id || null,
            leaseUntil: null,
            message:
              'Cancelamento rejeitado nesta tentativa. Revise os dados antes de solicitar novamente.',
          },
        });
        if (!changed.count) return;
        await tx.fiscalDocument.updateMany({
          where: {
            id: request.documentId,
            activeRequestId: request.id,
            status: 'CANCEL_REQUESTED',
          },
          data: { status: 'AUTHORIZED' },
        });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            type: 'FISCAL',
            referenceId: request.id,
            description: 'Resposta direta: cancelamento fiscal rejeitado',
          },
        });
      });
      return;
    }
    await db.fiscalRequest.updateMany({
      where: {
        id: request.id,
        status: 'CANCEL_REQUESTED',
        cancelAttemptId: request.cancelAttemptId,
        cancelPhase: 'SENDING',
      },
      data: {
        cancelPhase: 'RESPONDED',
        cancelEventId: event.success ? event.data.id || null : null,
        leaseUntil: null,
      },
    });
  } catch {
    throw new BusinessError(
      'Cancelamento não confirmado. Consulte antes de tentar novamente.',
    );
  }
  await reconcileFiscal(actor, request.id, client);
}

export async function fiscalDownload(
  actor: Actor,
  requestId: string,
  format: 'xml' | 'pdf' | 'cancel-xml',
  transport?: Transport,
) {
  const request = await owned(actor, requestId);
  if (
    !['AUTHORIZED', 'CANCEL_REQUESTED', 'CANCELLED'].includes(request.status) ||
    !request.providerId
  )
    throw new BusinessError(
      'Documento autorizado ainda indisponível para download.',
    );
  if (format === 'cancel-xml' && request.status !== 'CANCELLED')
    throw new BusinessError('Cancelamento ainda não confirmado.');
  const { mkdir, readFile, writeFile, rename } =
    await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = join(
    process.cwd(),
    '.local',
    'fiscal',
    actor.organizationId,
    request.id,
  );
  const file = join(
    dir,
    `documento.${request.provider === 'FOCUS' && request.model === '65' && format === 'pdf' ? 'html' : format}`,
  );
  try {
    return new Uint8Array(await readFile(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const client = requestTransport(request.provider, transport);
  const content =
    format === 'cancel-xml'
      ? await client.downloadCancellation!(
          request.model as '55' | '65',
          request.providerId,
        )
      : await client.download(
          request.model as '55' | '65',
          request.providerId,
          format,
        );
  await mkdir(dir, { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, content, { mode: 0o600 });
  await rename(temp, file);
  return content;
}

export async function fiscalFileInfo(
  actor: Actor,
  requestId: string,
  format: 'xml' | 'pdf' | 'cancel-xml',
) {
  const request = await owned(actor, requestId);
  const html =
    format === 'pdf' && request.provider === 'FOCUS' && request.model === '65';
  return {
    extension: html ? 'html' : format === 'cancel-xml' ? 'xml' : format,
    contentType: html
      ? 'text/html; charset=utf-8'
      : format === 'pdf'
        ? 'application/pdf'
        : 'application/xml',
  };
}

export async function archiveFiscalFiles(
  actor: Actor,
  requestId: string,
  transport?: Transport,
) {
  const request = await owned(actor, requestId);
  if (!['AUTHORIZED', 'CANCEL_REQUESTED', 'CANCELLED'].includes(request.status))
    return;
  for (const [format, field] of [
    ['xml', 'xmlArchivedAt'],
    ['pdf', 'pdfArchivedAt'],
    ['cancel-xml', 'cancelXmlArchivedAt'],
  ] as const) {
    if (
      request[field] ||
      (format === 'cancel-xml' && request.status !== 'CANCELLED')
    )
      continue;
    await fiscalDownload(actor, request.id, format, transport);
    await db.fiscalRequest.update({
      where: { id: request.id },
      data: { [field]: new Date() },
    });
  }
}

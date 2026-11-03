import type { ViewProps } from '@/modules/shared/view-types';
import Link from 'next/link';
import { db } from '@/lib/db';
import { brl, dateTime } from '@/lib/money';
import { Card, Table, Empty, Badge } from '@/components/ui';
import { FiscalForm } from '@/components/domain-forms';
import { FocusRequestActions } from './acbr-forms';
import { FiscalDraftForm } from './draft-form';
import { configuredFiscalTemplate } from './template';
const statusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  ISSUED: 'Emitida · informada',
  AUTHORIZED: 'Autorizada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
  CONFIRMED: 'Confirmada',
  READY: 'Prévia pronta · teste',
  SENDING: 'Enviando · teste',
  PROCESSING: 'Processando · teste',
  UNKNOWN: 'Resultado incerto · consultar',
  CANCEL_REQUESTED: 'Cancelamento solicitado · teste',
  ERROR: 'Erro técnico',
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export async function FiscalView({ actor, query }: ViewProps) {
  const organizationId = actor.organizationId;
  const [settings, docs] = await Promise.all([
    db.fiscalSettings.findUnique({ where: { organizationId } }),
    db.fiscalDocument.findMany({
      where: { organizationId },
      include: {
        sale: {
          include: {
            items: { include: { product: true }, orderBy: { id: 'asc' } },
            customer: true,
          },
        },
        requests: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      skip: (query.page - 1) * 25,
    }),
  ]);
  return (
    <>
      <p className="hint">
        Focus NFe · homologação, sem valor fiscal.{' '}
        <Link href="/configuracoes#fiscal">
          Configurações e cadastros fiscais
        </Link>
      </p>
      <Card>
        <h2>Documentos das vendas</h2>
        {docs.length ? (
          <Table headers={['Venda', 'Modelo', 'Situação', 'Valor', 'Detalhes']}>
            {docs.map((d) => {
              const active = d.requests.find((r) => r.id === d.activeRequestId);
              const historical = active?.provider === 'ACBR';
              return (
                <tr key={d.id}>
                  <td>
                    #{d.saleId.slice(0, 8)}
                    <small>{dateTime(d.sale.createdAt)}</small>
                  </td>
                  <td>{active?.model || d.model || 'A definir'}</td>
                  <td>
                    <Badge>
                      {statusLabel[d.status] || d.status}
                      {historical
                        ? ' · histórico ACBr'
                        : d.source === 'FOCUS'
                          ? ' · teste Focus'
                          : d.source === 'ASSISTED'
                            ? ' · registro assistido'
                            : ''}
                    </Badge>
                  </td>
                  <td>{brl(d.sale.total.toString())}</td>
                  <td>
                    <details>
                      <summary>Abrir documento</summary>
                      <p>
                        Chave de acesso:{' '}
                        <span className="break-key">
                          {d.accessKey || 'Não informada'}
                        </span>
                      </p>
                      {d.source === 'ASSISTED' && (
                        <details>
                          <summary>Registro de documento externo</summary>
                          <FiscalForm
                            id={d.id}
                            status={d.status}
                            accessKey={d.accessKey}
                            model={d.model}
                            evidence={d.evidence}
                          />
                        </details>
                      )}
                      {!historical &&
                        ['PENDING', 'REJECTED'].includes(d.status) && (
                          <FiscalDraftForm
                            documentId={d.id}
                            templates={
                              Object.fromEntries(
                                (['55', '65'] as const).map((model) => [
                                  model,
                                  JSON.stringify(
                                    configuredFiscalTemplate(
                                      {
                                        id: d.sale.id,
                                        total: d.sale.total.toString(),
                                        subtotal: d.sale.subtotal.toString(),
                                        discount: d.sale.discount.toString(),
                                        items: d.sale.items.map((i) => ({
                                          ...i,
                                          unitPrice: i.unitPrice.toString(),
                                          total: i.total.toString(),
                                        })),
                                      },
                                      actor.organization.cnpj,
                                      model,
                                      {
                                        emitter: settings?.emitter,
                                        customer:
                                          d.sale.customer?.fiscalAddress,
                                        products: Object.fromEntries(
                                          d.sale.items.map((i) => [
                                            i.productId,
                                            i.product.fiscalData,
                                          ]),
                                        ),
                                      },
                                    ),
                                  ),
                                ]),
                              ) as Record<'55' | '65', string>
                            }
                          />
                        )}
                      {d.requests.map((r) => {
                        const snapshot = object(r.payload);
                        const isFocus = r.provider === 'FOCUS';
                        return (
                          <details key={r.id} open={r.id === d.activeRequestId}>
                            <summary>
                              {r.id === d.activeRequestId
                                ? 'Solicitação atual'
                                : 'Revisão anterior'}{' '}
                              · {isFocus ? 'Focus NFe' : 'Histórico ACBr'} ·{' '}
                              {statusLabel[r.status] || r.status}
                            </summary>
                            <p>
                              Modelo {r.model} · série{' '}
                              {String(
                                snapshot.serie ||
                                  r.fiscalSeries ||
                                  'a confirmar',
                              )}{' '}
                              · número{' '}
                              {String(
                                snapshot.numero ||
                                  r.fiscalNumber ||
                                  'a confirmar',
                              )}{' '}
                              · protocolo {r.protocol || 'a confirmar'}
                            </p>
                            {isFocus && (
                              <p>
                                Operação:{' '}
                                {String(
                                  snapshot.natureza_operacao || 'a confirmar',
                                )}
                                . Destinatário:{' '}
                                {String(
                                  snapshot.nome_destinatario ||
                                    'Consumidor sem identificação',
                                )}
                                . Valor:{' '}
                                {snapshot.valor_total !== undefined
                                  ? brl(String(snapshot.valor_total))
                                  : brl(d.sale.total.toString())}
                                .
                              </p>
                            )}
                            {isFocus && Array.isArray(snapshot.items) && (
                              <ul>
                                {snapshot.items.map((item, index) => {
                                  const row = object(item);
                                  return (
                                    <li key={index}>
                                      {String(row.descricao || 'Item')} ·{' '}
                                      {String(row.quantidade_comercial || '')}{' '}
                                      {String(row.unidade_comercial || '')} ·{' '}
                                      {brl(String(row.valor_bruto || 0))}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            {isFocus &&
                              Array.isArray(snapshot.formas_pagamento) && (
                                <p>
                                  Pagamento fiscal:{' '}
                                  {snapshot.formas_pagamento
                                    .map((payment) => {
                                      const row = object(payment);
                                      return `${({ '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de crédito', '04': 'Cartão de débito', '05': 'Crédito da loja', '15': 'Boleto', '16': 'Depósito', '17': 'PIX', '18': 'Transferência' } as Record<string, string>)[String(row.forma_pagamento)] || String(row.forma_pagamento)} · ${brl(String(row.valor_pagamento || 0))} · ${Number(row.indicador_pagamento) === 1 ? 'a prazo' : 'à vista'}`;
                                    })
                                    .join('; ')}
                                </p>
                              )}
                            {r.message && <p role="status">{r.message}</p>}
                            <details>
                              <summary>Avançado · snapshot preservado</summary>
                              <pre
                                style={{
                                  whiteSpace: 'pre-wrap',
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {JSON.stringify(r.payload, null, 2)}
                              </pre>
                            </details>
                            {isFocus && r.id === d.activeRequestId ? (
                              <FocusRequestActions
                                requestId={r.id}
                                status={r.status}
                              />
                            ) : !isFocus ? (
                              <>
                                <p className="hint">
                                  Histórico ACBr somente para consulta local.
                                  Não é possível enviar, consultar o provedor ou
                                  cancelar esta solicitação por Focus.
                                </p>
                                <p>
                                  {r.xmlArchivedAt && (
                                    <a href={`/api/fiscal/${r.id}/xml`}>
                                      XML arquivado{' '}
                                    </a>
                                  )}
                                  {r.pdfArchivedAt && (
                                    <a href={`/api/fiscal/${r.id}/pdf`}>
                                      DANFE arquivado{' '}
                                    </a>
                                  )}
                                  {r.cancelXmlArchivedAt && (
                                    <a href={`/api/fiscal/${r.id}/cancel-xml`}>
                                      Cancelamento arquivado
                                    </a>
                                  )}
                                </p>
                              </>
                            ) : null}
                          </details>
                        );
                      })}
                    </details>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>
            Ao finalizar uma venda, seu acompanhamento fiscal será criado
            automaticamente.
          </Empty>
        )}
        <p className="table-note">
          Com resultado incerto, consulte antes de reenviar. O cancelamento
          fiscal e o cancelamento da venda são ações separadas.
        </p>
      </Card>
    </>
  );
}

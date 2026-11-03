import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Package, Wallet, Clock3, UserRound } from 'lucide-react';
import { db } from '@/lib/db';
import { brl, D, dateTime } from '@/lib/money';
import { requireActor } from '@/modules/auth/server';
import { Card, Badge, PageTitle } from '@/components/ui';
import { OperationForm } from '@/components/operation-form';
import { CancelForm } from '@/modules/sales/cancel-form';
import { OrderReceipt } from '@/modules/orders/order-receipt';
import {
  orderInclude,
  pendingBalance,
  fulfillmentLabel,
} from '@/modules/orders/queries';
export default async function OrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor(),
    { id } = await params;
  const s = await db.sale.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: orderInclude,
  });
  if (!s) notFound();
  const history = await db.auditLog.findMany({
    where: {
      organizationId: actor.organizationId,
      OR: [
        { referenceId: s.id },
        { referenceId: { in: s.payments.map((p) => p.id) } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const balance = pendingBalance(s),
    received = D(s.total.toString()).minus(balance);
  const active = s.status === 'CONFIRMED';
  const phone = s.customer?.phone?.replace(/\D/g, '') || '';
  return (
    <div className="order-detail">
      <Link className="text-link" href="/pedidos">
        ← Pedidos
      </Link>
      <PageTitle
        title={`Pedido #${s.id.slice(0, 8)}`}
        description={`Criado em ${dateTime(s.createdAt)}`}
      />
      <Card>
        <div className="section-heading">
          <h2>
            <UserRound size={24} />
            {s.customer?.name || 'Sem cadastro'}
          </h2>
          {phone && (
            <a
              className="small-button"
              href={`https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}?text=${encodeURIComponent('Olá! Vamos conversar sobre seu pedido?')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          )}
        </div>
      </Card>
      <Card>
        <h2>Produtos</h2>
        <ul className="order-lines">
          {s.items.map((i) => (
            <li key={i.id}>
              <div>
                <strong>{i.productName}</strong>
                <small>
                  {i.quantity} un. × {brl(i.unitPrice.toString())}
                </small>
              </div>
              <strong>{brl(i.total.toString())}</strong>
            </li>
          ))}
        </ul>
        <div className="order-lines">
          <p>
            Subtotal <strong>{brl(s.subtotal.toString())}</strong>
          </p>
          <p>
            Desconto <strong>{brl(s.discount.toString())}</strong>
          </p>
        </div>
        <div className="order-total">
          <span>Total do pedido</span>
          <strong>{brl(s.total.toString())}</strong>
        </div>
      </Card>
      <Card>
        <div className="section-heading">
          <h2>
            <Package size={24} />
            {s.fulfillmentMode === 'PICKUP' ? 'Retirada' : 'Entrega'}
          </h2>
          <Badge>{fulfillmentLabel(s)}</Badge>
        </div>
        <p>
          {s.expectedDate
            ? `Previsão: ${s.expectedDate.split('-').reverse().join('/')}`
            : 'Sem previsão combinada'}
        </p>
        {s.address && <p>{s.address}</p>}
        {s.deliveryNotes && <div className="notice">{s.deliveryNotes}</div>}
        {s.completedAt && <small>Concluído em {dateTime(s.completedAt)}</small>}
        {active && s.fulfillmentStatus === 'PENDING' && (
          <OperationForm
            operation="complete-order"
            button={
              s.fulfillmentMode === 'PICKUP'
                ? 'Confirmar retirada integral'
                : 'Confirmar entrega integral'
            }
          >
            <input type="hidden" name="saleId" value={s.id} />
            <input type="hidden" name="expectedVersion" value={s.version} />
            <p className="hint">
              Confirme somente após entregar todas as unidades. Não registra
              recebimento.
            </p>
          </OperationForm>
        )}
      </Card>
      <Card>
        <div className="section-heading">
          <h2>
            <Wallet size={24} />
            Pagamento
          </h2>
          <Badge>
            {balance.eq(0)
              ? 'Pago'
              : received.gt(0)
                ? 'Recebido em parte'
                : 'Em aberto'}
          </Badge>
        </div>
        <div className="payment-amounts">
          <div>
            Já recebido<strong>{brl(received)}</strong>
          </div>
          <div>
            Falta receber<strong>{brl(balance)}</strong>
          </div>
        </div>
        {s.agreementNotes && <p>Combinado: {s.agreementNotes}</p>}
        {s.installments.length ? (
          <ol className="installment-list">
            {s.installments.map((part) => (
              <li key={part.id}>
                <strong>
                  {part.position}ª parcela · {brl(part.amount.toString())}
                </strong>
                <span>
                  {part.dueDate
                    ? part.dueDate.split('-').reverse().join('/')
                    : 'Sem vencimento'}
                </span>
                <small>
                  Recebido: {brl(part.received.toString())} · Falta:{' '}
                  {brl(
                    D(part.amount.toString()).minus(part.received.toString()),
                  )}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          balance.gt(0) && (
            <p>Saldo em aberto, sem calendário. Sem vencimento não é atraso.</p>
          )
        )}
        {s.payments.length > 0 && (
          <details>
            <summary>Recebimentos registrados</summary>
            {s.payments.map((p) => (
              <p key={p.id}>
                {dateTime(p.occurredAt)} · {brl(p.amount.toString())} ·{' '}
                {p.method === 'PIX'
                  ? 'Pix'
                  : p.method === 'CASH'
                    ? 'Dinheiro'
                    : 'Cartão'}
              </p>
            ))}
          </details>
        )}
        {active && balance.gt(0) && (
          <details className="receipt-panel">
            <summary>Registrar recebimento</summary>
            <OrderReceipt saleId={s.id} balance={balance.toFixed(2)} />
          </details>
        )}
      </Card>
      <Card>
        <details>
          <summary>
            <Clock3 size={22} /> Histórico do pedido
          </summary>
          {history.map((h) => (
            <p key={h.id}>
              <small>{dateTime(h.createdAt)}</small>
              <br />
              {h.description}
            </p>
          ))}
        </details>
      </Card>
      {active && (
        <Card>
          <details>
            <summary>Outras ações</summary>
            <CancelForm saleId={s.id} />
          </details>
        </Card>
      )}
    </div>
  );
}

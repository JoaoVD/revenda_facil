'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
import { brl, dateTime } from '@/lib/money';
import { commandLabels, type ConflictReview } from './resolution-contracts';
export function ResolutionForm({ review }: { review: ConflictReview }) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [action, setAction] = useState('RETRY');
  const router = useRouter();
  const editable = ['ATTENTION', 'WAITING'].includes(review.status);
  return (
    <section className="stack">
      <h2>{commandLabels[review.type] || 'Registro'} para conferir</h2>
      <p>Capturado em {dateTime(new Date(review.capturedAt))}</p>
      <p className={review.status === 'APPLIED' ? 'success' : 'notice'}>
        {review.status === 'APPLIED'
          ? 'Conferência aplicada. O aparelho receberá a confirmação ao sincronizar.'
          : review.message}
      </p>
      {review.blockedBy.map((dep) => (
        <p key={dep.id}>
          {dep.status === 'MISSING' ? (
            'Sincronize o aparelho de origem: um registro anterior ainda não chegou ao servidor.'
          ) : (
            <>
              Resolva primeiro:{' '}
              <Link href={`/pendencias?command=${dep.id}`}>
                {commandLabels[dep.type] || 'Registro anterior'}
              </Link>
            </>
          )}
        </p>
      ))}
      {review.originalAmount && (
        <p>
          Valor capturado: <strong>{brl(review.originalAmount)}</strong>
        </p>
      )}
      {review.customerName && <p>Cliente: {review.customerName}</p>}
      {review.items && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Disponível agora</th>
                <th>Preço atual</th>
              </tr>
            </thead>
            <tbody>
              {review.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.available}</td>
                  <td>{brl(item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {review.currentTotal && (
        <p>
          Total com os preços atuais:{' '}
          <strong>{brl(review.currentTotal)}</strong>
        </p>
      )}
      {review.sale && (
        <p>
          Pedido #{review.sale.id.slice(0, 8)} ·{' '}
          {review.sale.status === 'CANCELLED'
            ? 'Cancelado'
            : review.sale.fulfillmentStatus === 'COMPLETED'
              ? 'Atendimento concluído'
              : 'Atendimento pendente'}{' '}
          · Saldo {brl(review.sale.balance)}{' '}
          <Link href={`/pedidos/${review.sale.id}`}>Ver pedido</Link>
        </p>
      )}
      {editable && !review.blockedBy.length && (
        <OperationForm
          operation="resolve-sync"
          reset={false}
          button="Confirmar conferência"
          onSuccess={() => setKey(crypto.randomUUID())}
          transform={(data) => ({
            idempotencyKey: key,
            commandId: review.id,
            expectedRevision: review.revision,
            action,
            reason: String(data.get('reason')),
            expectedTotal: review.currentTotal,
            expectedVersion: review.sale?.version,
            targetSaleId: String(data.get('targetSaleId') || '') || undefined,
            installments:
              action === 'ORDER_PRICES'
                ? (review.installments || []).map((_, i) => ({
                    amount: String(data.get(`amount-${i}`)),
                    dueDate: String(data.get(`date-${i}`) || '') || undefined,
                  }))
                : undefined,
          })}
        >
          <Select
            label="Como resolver"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="RETRY">Tentar novamente sem alterar os dados</option>
            {review.type === 'ORDER' && (
              <option value="ORDER_PRICES">
                Confirmar os preços atuais e revisar parcelas
              </option>
            )}
            {review.type === 'DELIVERY' &&
              review.sale?.status === 'CONFIRMED' && (
                <option value="DELIVERY_VERSION">
                  Conferir e usar o atendimento atualizado
                </option>
              )}
            {review.type === 'PAYMENT' && Boolean(review.targets?.length) && (
              <option value="PAYMENT_TARGET">
                Aplicar o valor inteiro a outro pedido deste cliente
              </option>
            )}
            {review.type === 'CUSTOMER' && review.customerName && (
              <option value="CUSTOMER_CURRENT">
                Usar o cadastro atual, preservando seus dados
              </option>
            )}
          </Select>
          {action === 'ORDER_PRICES' && (
            <>
              <p className="notice">
                Você está confirmando o total atualizado de{' '}
                {brl(review.currentTotal || '0')}. O valor já recebido de{' '}
                {brl(review.paid || '0')} será preservado. Se houver parcelas,
                confirme os valores combinados abaixo.
              </p>
              {review.installments?.map((part, i) => (
                <div className="installment-fields" key={i}>
                  <Field
                    label={`${i + 1}ª parcela (R$)`}
                    name={`amount-${i}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={part.amount}
                    required
                  />
                  <Field
                    label="Vencimento opcional"
                    name={`date-${i}`}
                    type="date"
                    defaultValue={part.dueDate || ''}
                  />
                </div>
              ))}
            </>
          )}
          {action === 'PAYMENT_TARGET' && (
            <Select
              label="Pedido que deve receber este valor"
              name="targetSaleId"
              required
            >
              <option value="">Selecione</option>
              {review.targets?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · saldo {brl(s.balance)}
                </option>
              ))}
            </Select>
          )}
          <Field
            label="O que foi conferido?"
            name="reason"
            minLength={5}
            maxLength={300}
            placeholder="Ex.: cliente confirmou o novo valor"
            required
          />
          <label>
            <input type="checkbox" required /> Conferi os dados e autorizo esta
            decisão.
          </label>
          <p className="hint">
            O registro original permanece no histórico. Esta ação exige
            internet; preços, estoque e saldo serão validados novamente no
            servidor.
          </p>
        </OperationForm>
      )}
      <button
        type="button"
        className="small-button"
        onClick={() => router.refresh()}
      >
        Atualizar dados da conferência
      </button>
    </section>
  );
}

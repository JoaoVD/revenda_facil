'use client';
import { useState } from 'react';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
import { brl } from '@/lib/money';
export function PaymentForm({
  sales,
  purchases,
  initialKind,
  preset,
}: {
  /** Venda/compra já escolhida (ex.: aberto a partir do card). */
  preset?: { referenceId: string; balance: string; description: string };
  initialKind?: 'SALE' | 'PURCHASE' | 'EXPENSE';
  sales: { id: string; label: string }[];
  purchases: { id: string; label: string }[];
}) {
  const [kind, setKind] = useState<string>(initialKind || 'SALE'),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [amount, setAmount] = useState('');
  return (
    <OperationForm
      operation="payment"
      button="Confirmar lançamento"
      onSuccess={() => {
        setKey(crypto.randomUUID());
        setAmount('');
      }}
      transform={(data) => ({
        ...Object.fromEntries(data),
        idempotencyKey: key,
      })}
    >
      {initialKind ? (
        <input type="hidden" name="kind" value={initialKind} />
      ) : (
        <Select
          label="O que deseja registrar?"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="SALE">Recebimento de venda</option>
          <option value="PURCHASE">Pagamento de compra</option>
          <option value="EXPENSE">Despesa paga</option>
        </Select>
      )}
      {kind !== 'EXPENSE' && (
        <Select
          label={kind === 'SALE' ? 'Venda' : 'Compra'}
          name="referenceId"
          required
          defaultValue={preset?.referenceId}
        >
          <option value="">Selecione</option>
          {(kind === 'SALE' ? sales : purchases).map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </Select>
      )}
      <Field
        label="Descrição"
        name="description"
        defaultValue={preset?.description}
        required
        minLength={2}
        maxLength={200}
      />
      <Field
        label="Valor (R$)"
        name="amount"
        type="number"
        min="0.01"
        step="0.01"
        required
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      {preset && (
        <div className="quick-picks">
          <button
            type="button"
            aria-pressed={amount === preset.balance}
            onClick={() => setAmount(preset.balance)}
          >
            Valor total · {brl(preset.balance)}
          </button>
        </div>
      )}
      <Select label="Forma de pagamento" name="method">
        <option value="PIX">Pix</option>
        <option value="CASH">Dinheiro</option>
        <option value="CARD">Cartão</option>
      </Select>
      <div className="notice">
        Confirme apenas valores efetivamente recebidos ou pagos.
      </div>
    </OperationForm>
  );
}

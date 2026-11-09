'use client';
import { useState } from 'react';
import { OperationForm } from '@/components/operation-form';
import { Field, ChoiceGroup } from '@/components/ui';
import { brl } from '@/lib/money';
export function OrderReceipt({
  saleId,
  balance,
}: {
  saleId: string;
  balance: string;
}) {
  const [key, setKey] = useState(() => crypto.randomUUID()),
    [amount, setAmount] = useState(''),
    [method, setMethod] = useState<'PIX' | 'CASH' | 'CARD'>('PIX');
  return (
    <OperationForm
      operation="payment"
      button="Confirmar recebimento"
      onSuccess={() => {
        setKey(crypto.randomUUID());
        setAmount('');
      }}
      transform={(data) => ({
        ...Object.fromEntries(data),
        idempotencyKey: key,
        kind: 'SALE',
        referenceId: saleId,
        description: 'Recebimento do pedido',
      })}
    >
      <Field
        label={`Valor recebido (saldo ${brl(balance)})`}
        name="amount"
        type="number"
        min="0.01"
        max={balance}
        step="0.01"
        required
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <div className="quick-picks">
        <button
          type="button"
          aria-pressed={amount === balance}
          onClick={() => setAmount(balance)}
        >
          Recebi tudo · {brl(balance)}
        </button>
      </div>
      <ChoiceGroup
        label="Meio do recebimento"
        name="method"
        value={method}
        options={[
          ['PIX', 'Pix'],
          ['CASH', 'Dinheiro'],
          ['CARD', 'Cartão'],
        ]}
        onChange={setMethod}
      />
      <p className="hint">O valor abate as parcelas na ordem.</p>
    </OperationForm>
  );
}

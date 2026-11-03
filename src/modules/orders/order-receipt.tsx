'use client';
import { useState } from 'react';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
import { brl } from '@/lib/money';
export function OrderReceipt({
  saleId,
  balance,
}: {
  saleId: string;
  balance: string;
}) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <OperationForm
      operation="payment"
      button="Confirmar recebimento"
      onSuccess={() => setKey(crypto.randomUUID())}
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
      />
      <Select label="Meio do recebimento" name="method">
        <option value="PIX">Pix</option>
        <option value="CASH">Dinheiro</option>
        <option value="CARD">Cartão</option>
      </Select>
      <p className="hint">
        Ao confirmar, o valor será distribuído entre parcelas na ordem exibida,
        cobrindo cada saldo antes da próxima. Pode ser menor ou maior que uma
        parcela, até o saldo total.
      </p>
    </OperationForm>
  );
}

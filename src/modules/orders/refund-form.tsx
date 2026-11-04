'use client';
import { useState } from 'react';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
import { brl } from '@/lib/money';
export function RefundForm({
  saleId,
  version,
  received,
  delivered,
}: {
  saleId: string;
  version: number;
  received: string;
  delivered: boolean;
}) {
  const [key] = useState(() => crypto.randomUUID());
  return (
    <OperationForm
      operation="refund-cancel"
      button="Registrar reembolso e cancelar pedido"
      reset={false}
      transform={(data) => ({
        idempotencyKey: key,
        saleId,
        expectedVersion: version,
        amount: received,
        method: String(data.get('method')),
        reason: String(data.get('reason')),
        confirmed: data.get('confirmed') === 'on',
        itemsReturned: data.get('itemsReturned') === 'on',
      })}
    >
      <p className="notice">
        Cancelamento integral: devolva {brl(received)} ao cliente e depois
        registre aqui. Este botão não realiza Pix, estorno de cartão nem
        transferência bancária.
      </p>
      <Select label="Como o dinheiro foi devolvido?" name="method">
        <option value="PIX">Pix</option>
        <option value="CASH">Dinheiro</option>
        <option value="CARD">Estorno no cartão já realizado</option>
      </Select>
      <Field
        label="Motivo do cancelamento e reembolso"
        name="reason"
        minLength={5}
        maxLength={300}
        required
      />
      {delivered && (
        <label>
          <input name="itemsReturned" type="checkbox" required /> Todos os
          produtos deste pedido retornaram fisicamente ao estoque.
        </label>
      )}
      <label>
        <input name="confirmed" type="checkbox" required /> Confirmei a
        devolução integral de {brl(received)} ao cliente.
      </label>
      <p className="hint">
        Mantém os recebimentos originais, registra a saída de dinheiro e
        compensa o estoque. Se houver documento fiscal em andamento, resolva-o
        antes desta operação.
      </p>
    </OperationForm>
  );
}

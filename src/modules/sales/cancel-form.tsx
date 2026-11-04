'use client';
import { OperationForm } from '@/components/operation-form';
import { Field } from '@/components/ui';
export function CancelForm({
  saleId,
  delivered = true,
}: {
  saleId: string;
  delivered?: boolean;
}) {
  return (
    <details>
      <summary>Cancelar venda</summary>
      <OperationForm
        operation="cancel"
        button="Confirmar cancelamento"
        transform={(data) => ({
          saleId,
          reason: String(data.get('reason')),
          itemsReturned: data.get('itemsReturned') === 'on',
        })}
      >
        <input type="hidden" name="saleId" value={saleId} />
        <Field
          label="Motivo do cancelamento"
          name="reason"
          minLength={5}
          maxLength={300}
          required
        />
        {delivered && (
          <label>
            <input type="checkbox" name="itemsReturned" required /> Todos os
            produtos retornaram fisicamente ao estoque.
          </label>
        )}
        <p className="hint">
          Estoque e histórico serão compensados. Para vendas já recebidas, abra
          o pedido e utilize o cancelamento com reembolso.
        </p>
      </OperationForm>
    </details>
  );
}

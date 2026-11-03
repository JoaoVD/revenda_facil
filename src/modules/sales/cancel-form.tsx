'use client';
import { OperationForm } from '@/components/operation-form';
import { Field } from '@/components/ui';
export function CancelForm({ saleId }: { saleId: string }) {
  return (
    <details>
      <summary>Cancelar venda</summary>
      <OperationForm operation="cancel" button="Confirmar cancelamento">
        <input type="hidden" name="saleId" value={saleId} />
        <Field
          label="Motivo do cancelamento"
          name="reason"
          minLength={5}
          maxLength={300}
          required
        />
        <p className="hint">
          Estoque e histórico serão compensados. Vendas já recebidas exigem
          devolução financeira e estão bloqueadas nesta etapa.
        </p>
      </OperationForm>
    </details>
  );
}

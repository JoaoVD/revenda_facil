'use client';
import { OperationForm } from '@/components/operation-form';
import { Field } from '@/components/ui';
export { FiscalDraftForm as AcbrPrepareForm } from './draft-form';
export function FocusRequestActions({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  return (
    <div className="stack">
      {status === 'READY' ? (
        <OperationForm
          operation="fiscal-send"
          button="Enviar em homologação"
          reset={false}
        >
          <input type="hidden" name="requestId" value={requestId} />
          <label>
            <input type="checkbox" name="confirmed" value="yes" required />{' '}
            Conferi a prévia e confirmo o envio de teste, sem valor fiscal.
          </label>
        </OperationForm>
      ) : (
        <OperationForm
          operation="fiscal-consult"
          button="Consultar resultado"
          reset={false}
        >
          <input type="hidden" name="requestId" value={requestId} />
        </OperationForm>
      )}
      {['AUTHORIZED', 'CANCEL_REQUESTED', 'CANCELLED'].includes(status) && (
        <p>
          <a href={`/api/fiscal/${requestId}/xml`}>Baixar XML de teste</a>
          {' · '}
          <a href={`/api/fiscal/${requestId}/danfe`}>Abrir DANFE de teste</a>
        </p>
      )}
      {status === 'CANCELLED' && (
        <p>
          <a href={`/api/fiscal/${requestId}/cancel-xml`}>
            Baixar XML do cancelamento de teste
          </a>
        </p>
      )}
      {status === 'AUTHORIZED' && (
        <details>
          <summary>Solicitar cancelamento fiscal de teste</summary>
          <OperationForm
            operation="fiscal-cancel"
            button="Solicitar cancelamento"
            reset={false}
          >
            <input type="hidden" name="requestId" value={requestId} />
            <Field
              label="Motivo do cancelamento fiscal"
              name="reason"
              minLength={15}
              maxLength={255}
              required
            />
            <p className="hint">
              Esta ação não cancela a venda nem registra reembolso.
            </p>
          </OperationForm>
        </details>
      )}
    </div>
  );
}
export { FocusRequestActions as AcbrRequestActions };

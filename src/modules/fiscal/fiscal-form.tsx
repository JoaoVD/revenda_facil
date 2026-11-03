'use client';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
export function FiscalForm({
  id,
  status,
  accessKey,
  model,
  evidence,
}: {
  id: string;
  status: string;
  accessKey: string | null;
  model: string | null;
  evidence: string | null;
}) {
  return (
    <details>
      <summary>Atualizar situação fiscal</summary>
      <OperationForm
        operation="fiscal"
        button="Salvar situação informada"
        reset={false}
      >
        <input type="hidden" name="id" value={id} />
        <Select
          label="Modelo do documento"
          name="model"
          defaultValue={model || '55'}
        >
          <option value="55">NF-e (55)</option>
          <option value="65">NFC-e (65)</option>
        </Select>
        <Select label="Situação informada" name="status" defaultValue={status}>
          {[
            ['PENDING', 'Pendente'],
            ['ISSUED', 'Emitida'],
            ['AUTHORIZED', 'Autorizada'],
            ['REJECTED', 'Rejeitada'],
            ['CANCELLED', 'Cancelada'],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Field
          label="Chave de acesso"
          name="accessKey"
          defaultValue={accessKey || ''}
          pattern="[0-9]{44}"
          inputMode="numeric"
        />
        <Field
          label="Origem / evidência do status (protocolo, consulta oficial)"
          name="evidence"
          defaultValue={evidence || ''}
          maxLength={500}
        />
        <p className="hint">
          Registro manual. O Revenda Fácil não consulta nem autoriza documentos
          na SEFAZ nesta etapa.
        </p>
      </OperationForm>
    </details>
  );
}

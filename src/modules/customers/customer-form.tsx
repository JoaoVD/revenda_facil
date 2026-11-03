'use client';
import { OperationForm } from '@/components/operation-form';
import { Field } from '@/components/ui';
export function CustomerForm() {
  return (
    <OperationForm operation="customer" button="Cadastrar cliente">
      <Field label="Nome" name="name" required minLength={2} />
      <details className="ux-optional">
        <summary>Contato e outros dados (opcional)</summary>
        <div className="stack">
          <Field label="Telefone (opcional)" name="phone" type="tel" />
          <Field
            label="CPF/CNPJ (opcional, somente números)"
            name="document"
            inputMode="numeric"
          />
          <Field label="E-mail (opcional)" name="email" type="email" />
          <Field label="Observações (opcional)" name="notes" maxLength={500} />
        </div>
      </details>
    </OperationForm>
  );
}

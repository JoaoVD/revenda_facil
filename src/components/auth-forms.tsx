'use client';
import { useActionState } from 'react';
import { onboardingAction } from '@/app/actions';
import { Field, Select } from './ui';
export { LoginForm } from './login-form';
export function OrganizationFields({
  values,
}: {
  values?: Record<string, string>;
}) {
  return (
    <>
      <Field
        label="Seu nome"
        name="ownerName"
        defaultValue={values?.ownerName}
        required
        maxLength={100}
      />
      <Field
        label="Nome da sua revenda"
        name="name"
        defaultValue={values?.name}
        required
        maxLength={100}
      />
      <Field
        label="CNPJ (somente números)"
        name="cnpj"
        inputMode="numeric"
        pattern="[0-9]{14}"
        defaultValue={values?.cnpj}
        required
      />
      <div className="form-grid">
        <Select label="Estado" name="state" defaultValue="SP">
          <option value="SP">São Paulo</option>
        </Select>
        <Field
          label="Município"
          name="city"
          defaultValue={values?.city}
          required
        />
      </div>
      <Field
        label="Telefone (opcional)"
        name="phone"
        type="tel"
        defaultValue={values?.phone}
      />
      <Field
        label="E-mail de contato (opcional)"
        name="email"
        type="email"
        defaultValue={values?.email}
      />
    </>
  );
}
export function OnboardingForm() {
  const [state, action, pending] = useActionState(onboardingAction, {
    ok: false,
    message: '',
  });
  return (
    <form action={action} className="stack">
      <OrganizationFields />
      {state.message && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="button">
        {pending ? 'Salvando…' : 'Começar a organizar minha revenda'}
      </button>
    </form>
  );
}

'use client';
import { OperationForm } from '@/components/operation-form';
import { OrganizationFields } from '@/components/auth-forms';
export function SettingsForm({ values }: { values: Record<string, string> }) {
  return (
    <OperationForm
      operation="settings"
      button="Salvar configurações"
      reset={false}
    >
      <OrganizationFields values={values} />
    </OperationForm>
  );
}

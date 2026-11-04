import type { ViewProps } from '@/modules/shared/view-types';
import { Card } from '@/components/ui';
import { SettingsForm } from '@/components/domain-forms';
import { FiscalConfiguration } from '@/modules/fiscal/configuration-view';
import { db } from '@/lib/db';
import { ReminderSettings } from '@/modules/reminders/forms';
import { PushSettings } from '@/modules/reminders/push-settings';
export async function SettingsView({ actor }: ViewProps) {
  const org = actor.organization;
  const reminder = await db.reminderPreference.findUnique({
    where: { organizationId: actor.organizationId },
  });
  return (
    <>
      <div className="split-layout">
        <Card>
          <h2>Dados da revenda</h2>
          <SettingsForm
            values={{
              name: org.name,
              ownerName: org.ownerName,
              cnpj: org.cnpj,
              state: org.state,
              city: org.city,
              phone: org.phone || '',
              email: org.email || '',
            }}
          />
        </Card>
        <Card>
          <h2>Preferências da operação</h2>
          <dl className="settings-list">
            <dt>Moeda</dt>
            <dd>Real brasileiro (BRL)</dd>
            <dt>Fuso horário</dt>
            <dd>America/Sao_Paulo</dd>
            <dt>Operação fiscal</dt>
            <dd>Focus NFe em homologação · NF-e/NFC-e · produção bloqueada</dd>
            <dt>Estoque</dt>
            <dd>Custo médio ponderado</dd>
          </dl>
          <p className="hint">
            A alteração de CNPJ exige revisão cadastral. Tributos e códigos
            fiscais devem ser validados pelo responsável contábil.
          </p>
        </Card>
      </div>
      <section id="fiscal">
        <FiscalConfiguration actor={actor} />
      </section>
      <Card>
        <h2>Lembretes de recebíveis</h2>
        <ReminderSettings
          values={
            reminder || {
              enabled: false,
              dayMode: 'FIRST',
              day: 1,
              time: '09:00',
              scope: 'ALL',
            }
          }
        />
        <PushSettings />
      </Card>
    </>
  );
}

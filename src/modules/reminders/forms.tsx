'use client';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
export function ReminderSettings({
  values,
}: {
  values: {
    enabled: boolean;
    dayMode: string;
    day: number;
    time: string;
    scope: string;
  };
}) {
  return (
    <OperationForm
      operation="reminder-settings"
      reset={false}
      button="Salvar lembrete"
      transform={(data) => ({
        ...Object.fromEntries(data),
        enabled: data.get('enabled') === 'on',
      })}
    >
      <label>
        <input type="checkbox" name="enabled" defaultChecked={values.enabled} />{' '}
        Ativar lembrete de recebíveis
      </label>
      <Select
        label="Quando conferir"
        name="dayMode"
        defaultValue={values.dayMode}
      >
        <option value="FIRST">Primeiro dia do mês</option>
        <option value="LAST">Último dia do mês</option>
        <option value="SPECIFIC">Dia específico</option>
      </Select>
      <Field
        label="Dia específico (1 a 31)"
        name="day"
        type="number"
        min={1}
        max={31}
        defaultValue={values.day}
        required
      />
      <Field
        label="Horário em São Paulo"
        name="time"
        type="time"
        defaultValue={values.time}
        required
      />
      <Select
        label="Saldos para conferir"
        name="scope"
        defaultValue={values.scope}
      >
        <option value="ALL">Todos os saldos pendentes</option>
        <option value="OVERDUE">Somente vencidos</option>
      </Select>
      <p className="hint">
        Meses sem o dia escolhido usam o último dia. O aviso aparece a partir do
        horário combinado, até a revisão ou quitação dos saldos.
      </p>
      <p className="notice">
        Aviso dentro do sistema disponível. Envio push remoto ainda não está
        habilitado: requer adaptador de transporte, credenciais VAPID e
        agendador.
      </p>
    </OperationForm>
  );
}
export function NoticeActions({ noticeId }: { noticeId: string }) {
  return (
    <div className="ux-actions">
      {[
        ['REVIEW', 'Marcar como revisado'],
        ['SNOOZE', 'Adiar 24 horas'],
      ].map(([action, label]) => (
        <OperationForm key={action} operation="reminder-review" button={label}>
          <input type="hidden" name="noticeId" value={noticeId} />
          <input type="hidden" name="action" value={action} />
        </OperationForm>
      ))}
    </div>
  );
}

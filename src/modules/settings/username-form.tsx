'use client';
import { useActionState } from 'react';
import { usernameAction } from '@/app/actions';
import { Field } from '@/components/ui';

/** Nome de usuário para entrar no lugar do e-mail. */
export function UsernameForm({
  current,
  email,
}: {
  current: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(usernameAction, {
    ok: false,
    message: '',
  });
  return (
    <form action={action} className="stack">
      <Field
        label="Nome de usuário"
        name="username"
        defaultValue={current}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        minLength={3}
        maxLength={30}
        pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,29}"
        title="De 3 a 30 letras, números, ponto, hífen ou sublinhado, sem espaços nem acentos."
        placeholder="Ex.: ana.cosmeticos"
        required
      />
      <p className="hint">
        Na tela de entrada, digite este usuário e sua senha. Ele está ligado ao
        e-mail {email || 'da conta'}; o e-mail também continua funcionando.
      </p>
      {state.message && (
        <p role="status" className={state.ok ? 'success' : 'error'}>
          {state.message}
        </p>
      )}
      <button className="button" disabled={pending}>
        {pending ? 'Salvando…' : current ? 'Trocar usuário' : 'Criar usuário'}
      </button>
    </form>
  );
}

'use client';
import { useActionState, useState } from 'react';
import { loginAction } from '@/app/actions';
import { Field } from './ui';
export function LoginForm({ configured }: { configured: boolean }) {
  const [signup, setSignup] = useState(false);
  const [state, action, pending] = useActionState(loginAction, {
    ok: false,
    message: '',
  });
  return (
    <form action={action} className="stack">
      <input type="hidden" name="mode" value={signup ? 'signup' : 'login'} />
      <Field
        label="Seu e-mail"
        name="email"
        type="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        required
      />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete={signup ? 'new-password' : 'current-password'}
        minLength={8}
        maxLength={128}
        required
      />
      {!configured && (
        <div className="notice">
          Acesso aguardando configuração do Supabase. As credenciais devem ser
          informadas no servidor.
        </div>
      )}
      {state.message && (
        <p role="status" className={state.ok ? 'success' : 'error'}>
          {state.message}
        </p>
      )}
      <button className="button" disabled={!configured || pending}>
        {pending
          ? 'Aguarde…'
          : signup
            ? 'Criar minha conta'
            : 'Entrar na minha revenda'}
      </button>
      <button
        type="button"
        className="text-button"
        onClick={() => setSignup(!signup)}
      >
        {signup ? 'Já tenho conta. Entrar' : 'Primeiro acesso? Criar conta'}
      </button>
    </form>
  );
}

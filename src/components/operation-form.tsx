'use client';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { operationAction } from '@/app/actions';
export function OperationForm({
  operation,
  children,
  button = 'Salvar',
  transform,
  reset = true,
  onSuccess,
}: {
  operation: string;
  children: ReactNode;
  button?: string;
  transform?: (data: FormData) => unknown;
  reset?: boolean;
  onSuccess?: () => void;
}) {
  const [state, setState] = useState({ ok: false, message: '' }),
    [pending, start] = useTransition(),
    router = useRouter();
  const running = useRef(false);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || running.current) return;
        running.current = true;
        const form = e.currentTarget,
          data = new FormData(form);
        start(async () => {
          let sending = false;
          try {
            const payload = transform
              ? transform(data)
              : Object.fromEntries(data);
            sending = true;
            const result = await operationAction(operation, payload);
            setState(result);
            if (result.ok) {
              if (reset) form.reset();
              onSuccess?.();
              router.refresh();
            }
          } catch (error) {
            setState({
              ok: false,
              message:
                !sending && error instanceof Error
                  ? error.message
                  : 'Não foi possível confirmar no servidor. O preenchimento foi mantido; confira a operação antes de tentar novamente.',
            });
          } finally {
            running.current = false;
          }
        });
      }}
    >
      {children}
      {state.message && (
        <p className={state.ok ? 'success' : 'error'} role="status">
          {state.message}
        </p>
      )}
      <button className="button" disabled={pending}>
        {pending ? 'Salvando…' : button}
      </button>
    </form>
  );
}

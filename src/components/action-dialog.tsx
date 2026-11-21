'use client';
import { useId, useRef, useState, type ReactNode } from 'react';

export function ActionDialog({
  title,
  trigger,
  triggerClassName = 'button',
  triggerLabel,
  children,
}: {
  title: string;
  trigger: string;
  /** Classe do botão que abre (ex.: `small-button` dentro de tabelas). */
  triggerClassName?: string;
  /** Nome acessível quando o texto do botão se repete (ex.: "Editar"). */
  triggerLabel?: string;
  children: ReactNode;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const dirty = useRef(false);
  const [revision, setRevision] = useState(0);
  /**
   * Fechar nunca fica bloqueado. Com envio em andamento (`aria-busy`),
   * só confirma: o servidor continua processando o que já foi enviado.
   */
  function close() {
    const element = dialog.current;
    if (!element) return;
    const busy = element.querySelector('[aria-busy="true"]');
    if (
      busy &&
      !window.confirm(
        'Ainda estamos salvando. Fechar mesmo assim? O que já foi enviado continua sendo processado.',
      )
    )
      return;
    if (
      !busy &&
      dirty.current &&
      !window.confirm('Descartar as alterações não salvas?')
    )
      return;
    element.close();
  }
  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        ref={opener}
        onClick={() => {
          dirty.current = false;
          dialog.current?.showModal();
          const first = dialog.current?.querySelector<HTMLElement>(
            'input:not([type="hidden"]), select, textarea',
          );
          first?.focus();
        }}
      >
        {trigger}
      </button>
      <dialog
        ref={dialog}
        className="ux-action-dialog"
        aria-labelledby={id}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onInputCapture={() => {
          dirty.current = true;
        }}
        onChangeCapture={() => {
          dirty.current = true;
        }}
        onResetCapture={() => {
          dirty.current = false;
        }}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          dirty.current = false;
          setRevision((value) => value + 1);
          opener.current?.focus();
        }}
      >
        <div className="section-heading">
          <h2 id={id}>{title}</h2>
          <button
            type="button"
            className="small-button"
            aria-label={`Fechar ${title}`}
            onClick={close}
          >
            Fechar
          </button>
        </div>
        <div key={revision}>{children}</div>
        <button
          type="button"
          className="small-button ux-dialog-cancel"
          onClick={close}
        >
          Cancelar
        </button>
      </dialog>
    </>
  );
}

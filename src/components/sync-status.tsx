'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { synchronize } from '@/modules/sync/client';
import {
  activeScope,
  prepareSnapshot,
  preparationState,
  type Scope,
  type Snapshot,
} from '@/modules/sync/local-store';
export function SyncStatus({ userId, organizationId }: Scope) {
  const [status, setStatus] = useState('Verificando comunicação…');
  const [locked, setLocked] = useState(false);
  async function prepareExplicitly() {
    try {
      const state = await preparationState();
      const response = await fetch('/api/sync', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error('Entre novamente para preparar os dados.');
      const snapshot: Snapshot = await response.json();
      if (
        snapshot.userId !== userId ||
        snapshot.organizationId !== organizationId
      )
        throw new Error('A conta mudou. Atualize a página.');
      if (!(await prepareSnapshot(snapshot, state.generation, true)))
        throw new Error('O bloqueio mudou em outra aba. Tente novamente.');
      setLocked(false);
      setStatus(await synchronize({ userId, organizationId }));
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar os dados.',
      );
    }
  }
  useEffect(() => {
    let cancelled = false,
      running = false;
    const scope = { userId, organizationId };
    async function run() {
      if (running || cancelled || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const preparation = await preparationState();
        if (preparation.locked) {
          if (!cancelled) {
            setLocked(true);
            setStatus('Cópia local bloqueada. A fila foi preservada.');
          }
          return;
        }
        if (!cancelled) setLocked(false);
        const active = await activeScope();
        if (
          !active ||
          active.userId !== userId ||
          active.organizationId !== organizationId
        ) {
          const response = await fetch('/api/sync', {
            cache: 'no-store',
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error('Sessão indisponível');
          const snapshot: Snapshot = await response.json();
          if (
            snapshot.userId !== userId ||
            snapshot.organizationId !== organizationId
          )
            throw new Error('Conta alterada');
          if (!(await prepareSnapshot(snapshot, preparation.generation)))
            return;
        }
        const message = await synchronize(scope);
        if (!cancelled) setStatus(message);
      } catch {
        if (!cancelled)
          setStatus(
            'Não foi possível preparar os dados neste aparelho. Confira a conexão e o armazenamento.',
          );
      } finally {
        running = false;
      }
    }
    function navigate(event: MouseEvent) {
      if (navigator.onLine) return;
      const target =
        event.target instanceof Element ? event.target.closest('a') : null;
      if (
        target?.href &&
        new URL(target.href).origin === location.origin &&
        !target.target
      ) {
        event.preventDefault();
        event.stopPropagation();
        location.assign(target.href);
      }
    }
    void navigator.storage?.persist?.().catch(() => false);
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        if (!cancelled)
          setStatus('Cache offline indisponível neste navegador.');
      });
    void run();
    const timer = setInterval(() => void run(), 30000);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', run);
    document.addEventListener('click', navigate, true);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', run);
      document.removeEventListener('click', navigate, true);
    };
  }, [userId, organizationId]);
  const tone =
    status === 'Tudo sincronizado'
      ? 'ok'
      : status === 'Verificando comunicação…'
        ? 'idle'
        : 'attention';
  return (
    <details
      className="sync-status"
      data-tone={tone}
      key={locked ? 'locked' : 'free'}
      open={locked || undefined}
    >
      <summary>
        <span className="sync-dot" aria-hidden="true" />
        <span className="sync-label" role="status">
          {status}
        </span>
      </summary>
      <div className="sync-tools">
        {locked && (
          <button
            type="button"
            className="small-button"
            onClick={() => void prepareExplicitly()}
          >
            Liberar cópia local nesta sessão
          </button>
        )}
        <Link prefetch={false} href="/operacao">
          Dados deste aparelho e sincronização →
        </Link>
        <Link prefetch={false} href="/pendencias">
          Conferir pendências →
        </Link>
      </div>
    </details>
  );
}

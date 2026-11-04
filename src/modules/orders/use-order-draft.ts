'use client';
import { useEffect, useRef, useState } from 'react';
import {
  activeScope,
  preparationState,
  scopeKey,
  type Scope,
} from '@/modules/sync/local-store';
import {
  readOrderDraft,
  saveOrderDraft,
  deleteOrderDraft,
  type DraftFields,
  type OrderDraft,
} from './draft-store';

export function useOrderDraft(
  scope: Scope | undefined,
  fields: DraftFields,
  restore: (fields: DraftFields) => void,
) {
  const [loadedPartition, setLoadedPartition] = useState<string | null>(
      scope ? null : '',
    ),
    [id, setId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState(
    scope ? 'Preparando rascunho neste aparelho…' : '',
  );
  const [submission, setSubmission] = useState<Record<string, unknown>>();
  const [reload, setReload] = useState(0);
  const metadata = useRef<Pick<OrderDraft, 'id' | 'revision'> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const closed = useRef(false),
    mounted = useRef(true),
    dirty = useRef(false);
  const hydrated = useRef('');
  const epoch = useRef(0);
  const restoreRef = useRef(restore);
  const initial = useRef(fields);
  const submissionRef = useRef(submission);
  const sequence = useRef(0);
  const partition = scope ? scopeKey(scope) : '';
  const ready = !scope || loadedPartition === partition;
  useEffect(() => {
    restoreRef.current = restore;
    submissionRef.current = submission;
  }, [restore, submission]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!scope) return;
    epoch.current++;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        if (cancelled) return;
        const active = await activeScope();
        if (cancelled) return;
        if (!active || scopeKey(active) !== partition) {
          const preparation = await preparationState();
          if (cancelled) return;
          setMessage(
            preparation.locked
              ? 'Cópia local bloqueada. Use “Liberar cópia local nesta sessão” acima para continuar.'
              : 'Preparando os dados neste aparelho… Os produtos serão liberados automaticamente.',
          );
          // A primeira sincronização pode levar mais de cinco segundos. Continuar
          // observando sem ativar outra conta nem desfazer um bloqueio explícito.
          timer = setTimeout(() => void load(), 750);
          return;
        }
        const saved = await readOrderDraft(scope!);
        if (cancelled) return;
        closed.current = false;
        if (saved) {
          metadata.current = { id: saved.id, revision: saved.revision };
          setId(saved.id);
          setSubmission(saved.submission);
          submissionRef.current = saved.submission;
          restoreRef.current(saved.fields);
          setMessage('Rascunho recuperado deste aparelho.');
        } else metadata.current = null;
        if (!saved) setId(crypto.randomUUID());
        hydrated.current = partition;
        setLoadedPartition(partition);
      } catch (error) {
        if (!cancelled)
          setMessage(
            error instanceof Error
              ? error.message
              : 'Não foi possível abrir o rascunho.',
          );
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // A partição é o identificador estável; o objeto scope pode mudar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partition, reload]);

  function write(
    nextFields: DraftFields,
    nextSubmission: Record<string, unknown> | undefined,
  ) {
    if (!scope || closed.current) return Promise.resolve();
    if (hydrated.current !== partition)
      return Promise.reject(
        new Error('Aguarde a preparação do rascunho desta conta.'),
      );
    dirty.current = true;
    const number = ++sequence.current;
    const generation = epoch.current;
    if (mounted.current) setMessage('Salvando rascunho…');
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (
          closed.current ||
          generation !== epoch.current ||
          hydrated.current !== partition
        )
          return;
        const saved = await saveOrderDraft(
          scope,
          { id, fields: nextFields, submission: nextSubmission },
          metadata.current,
        );
        metadata.current = { id: saved.id, revision: saved.revision };
        if (number === sequence.current) {
          dirty.current = false;
          if (mounted.current) setMessage('Rascunho salvo neste aparelho.');
        }
      });
    void queue.current.catch((error) => {
      if (mounted.current)
        setMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar o rascunho.',
        );
    });
    return queue.current;
  }
  const serialized = JSON.stringify(fields);
  useEffect(() => {
    if (scope && ready && hydrated.current === partition && !closed.current)
      void write(JSON.parse(serialized), submissionRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, ready, partition, id]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  async function saveSubmission(payload: Record<string, unknown>) {
    if (!scope) return;
    await write(fields, payload);
    submissionRef.current = payload;
    setSubmission(payload);
  }
  async function unlock() {
    if (!scope) return;
    await write(fields, undefined);
    submissionRef.current = undefined;
    setSubmission(undefined);
  }
  async function complete() {
    if (!scope) return;
    await queue.current;
    closed.current = true;
    if (metadata.current) await deleteOrderDraft(scope, metadata.current);
    dirty.current = false;
  }
  async function discard() {
    await complete();
    metadata.current = null;
    closed.current = false;
    submissionRef.current = undefined;
    setSubmission(undefined);
    restoreRef.current(initial.current);
    setId(crypto.randomUUID());
  }
  return {
    ready,
    id,
    message,
    submission,
    saveSubmission,
    unlock,
    complete,
    discard,
    retry: () => setReload((value) => value + 1),
  };
}

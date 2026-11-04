import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { synchronize } from '@/modules/sync/client';
import {
  reconcileCommands,
  acquireLease,
  enqueue,
  localCommands,
  saveSnapshot,
  updateCommand,
  type Snapshot,
} from '@/modules/sync/local-store';
import type { Command } from '@/modules/sync/contracts';

const scope = {
  userId: crypto.randomUUID(),
  organizationId: crypto.randomUUID(),
};
const snapshot: Snapshot = {
  ...scope,
  owner: 'TEST',
  serverAt: '2026-11-03T12:00:00Z',
  products: [],
  customers: [],
  sales: [],
  conflicts: [],
};
function command(): Command {
  return {
    ...scope,
    id: crypto.randomUUID(),
    contractVersion: 1,
    type: 'PAYMENT',
    capturedAt: new Date().toISOString(),
    dependencies: [],
    payload: { amount: '60', referenceId: crypto.randomUUID() },
  };
}
function transport(post: (value: Command) => Promise<Response>) {
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) =>
    options?.method === 'POST'
      ? post(JSON.parse(String(options.body)))
      : Response.json(snapshot),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  await saveSnapshot(snapshot);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('recuperação da fila persistente', () => {
  it('retoma automaticamente após mais de oito falhas temporárias sem mudar a intenção', async () => {
    const input = command();
    await enqueue(input);
    const sent: Command[] = [];
    let unavailable = true;
    transport(async (value) => {
      sent.push(value);
      return unavailable
        ? Response.json({}, { status: 503 })
        : Response.json({
            id: value.id,
            status: 'APPLIED',
            result: { id: 'payment-1' },
          });
    });
    for (let i = 0; i < 10; i++) {
      await synchronize(scope);
      const [saved] = await localCommands(scope);
      expect(saved.state).toBe('PENDING');
      expect(saved.attempts).toBe(i + 1);
      expect(saved.nextAttemptAt - Date.now()).toBeGreaterThan(0);
      expect(saved.nextAttemptAt - Date.now()).toBeLessThanOrEqual(300000);
      vi.setSystemTime(saved.nextAttemptAt);
    }
    unavailable = false;
    expect(await synchronize(scope)).toBe('Tudo sincronizado');
    expect((await localCommands(scope))[0].resultId).toBe('payment-1');
    expect(sent).toHaveLength(11);
    expect(new Set(sent.map((c) => c.id)).size).toBe(1);
    expect(
      sent.every(
        (c) => JSON.stringify(c.payload) === JSON.stringify(input.payload),
      ),
    ).toBe(true);
  });

  it('resposta perdida reenvia a mesma chave e só confirma com ACK correspondente', async () => {
    const input = command();
    await enqueue(input);
    const persisted = new Map<string, string>();
    let loseResponse = true;
    transport(async (value) => {
      if (!persisted.has(value.id))
        persisted.set(value.id, crypto.randomUUID());
      if (loseResponse) {
        loseResponse = false;
        throw new TypeError('Network error');
      }
      return Response.json({
        id: value.id,
        status: 'APPLIED',
        result: { id: persisted.get(value.id) },
      });
    });
    await synchronize(scope);
    const [pending] = await localCommands(scope);
    expect(pending.state).toBe('PENDING');
    expect(pending.resultId).toBeUndefined();
    vi.setSystemTime(pending.nextAttemptAt);
    await synchronize(scope);
    expect((await localCommands(scope))[0].resultId).toBe(
      persisted.get(input.id),
    );
    expect(persisted.size).toBe(1);
  });

  it('recupera a pausa de transporte legada, preservando rejeições comerciais', async () => {
    const first = command(),
      rejected = command();
    await enqueue(first);
    await enqueue(rejected);
    const saved = await localCommands(scope);
    for (const c of saved)
      await updateCommand({
        ...c,
        state: 'ATTENTION',
        attempts: 8,
        message:
          c.id === first.id
            ? 'Tentativas esgotadas. Informação preservada. Confira a conexão e solicite nova tentativa.'
            : 'Estoque insuficiente. Revise o carrinho.',
      });
    const sent: string[] = [];
    transport(async (value) => {
      sent.push(value.id);
      return Response.json({ id: value.id, status: 'APPLIED' });
    });
    await synchronize(scope);
    expect(sent).toEqual([first.id]);
    expect(
      (await localCommands(scope)).find((c) => c.id === rejected.id)?.state,
    ).toBe('ATTENTION');
  });

  it('conflito comercial exige revisão e não é reenviado automaticamente', async () => {
    await enqueue(command());
    const fetcher = transport(async () =>
      Response.json({ message: 'Saldo insuficiente' }, { status: 409 }),
    );
    await synchronize(scope);
    vi.setSystemTime(Date.now() + 3600000);
    await synchronize(scope);
    expect((await localCommands(scope))[0].state).toBe('ATTENTION');
    expect(
      fetcher.mock.calls.filter(([, options]) => options?.method === 'POST'),
    ).toHaveLength(1);
  });

  it('ACK de outro comando preserva a fila e uma segunda aba não adquire o lease', async () => {
    await enqueue(command());
    transport(async () =>
      Response.json({ id: crypto.randomUUID(), status: 'APPLIED' }),
    );
    await synchronize(scope);
    expect((await localCommands(scope))[0].state).toBe('PENDING');
    expect(await acquireLease(scope, 'first')).toBe(true);
    expect(await acquireLease(scope, 'second')).toBe(false);
  });

  it('a chave local protege também o tipo e as dependências, além do payload', async () => {
    const input = command();
    await enqueue(input);
    await enqueue(input);
    await expect(enqueue({ ...input, type: 'ORDER' })).rejects.toThrow();
    await expect(
      enqueue({ ...input, dependencies: [crypto.randomUUID()] }),
    ).rejects.toThrow();
    expect(await localCommands(scope)).toHaveLength(1);
  });

  it('campos opcionais não preenchidos têm a mesma representação do envio JSON', async () => {
    const input = command();
    await enqueue({
      ...input,
      payload: {
        ...input.payload,
        expectedDate: undefined,
        installments: [{ amount: '60', dueDate: undefined }],
      } as unknown as Command['payload'],
    });
    await enqueue({
      ...input,
      payload: { ...input.payload, installments: [{ amount: '60' }] },
    });
    const saved = await localCommands(scope);
    expect(saved).toHaveLength(1);
    expect(saved[0].payload).toEqual({
      ...input.payload,
      installments: [{ amount: '60' }],
    });
  });
  it('conferência no servidor atualiza o aparelho sem alterar a intenção e sem regredir confirmação', async () => {
    const input = command();
    await enqueue(input);
    const [pending] = await localCommands(scope);
    await updateCommand({ ...pending, state: 'ATTENTION' });
    await reconcileCommands(scope, [
      {
        id: input.id,
        status: 'APPLIED',
        message: null,
        result: { id: 'receipt-current' },
        resolvedPayload: { ...input.payload, referenceId: 'reconciled-sale' },
      },
    ]);
    let actual = (await localCommands(scope))[0];
    expect(actual.payload).toEqual(input.payload);
    expect(actual.state).toBe('APPLIED');
    expect(actual.resultId).toBe('receipt-current');
    expect(actual.resolvedPayload?.referenceId).toBe('reconciled-sale');
    await reconcileCommands(scope, [
      {
        id: input.id,
        status: 'WAITING',
        message: 'Antigo',
        result: null,
        resolvedPayload: null,
      },
    ]);
    actual = (await localCommands(scope))[0];
    expect(actual.state).toBe('APPLIED');
    expect(actual.resultId).toBe('receipt-current');
  });
});

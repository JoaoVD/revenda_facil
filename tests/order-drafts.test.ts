import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  saveSnapshot,
  lockLocalAccount,
  type Snapshot,
} from '@/modules/sync/local-store';
import {
  readOrderDraft,
  saveOrderDraft,
  deleteOrderDraft,
  type DraftFields,
} from '@/modules/orders/draft-store';
const scope = {
  userId: crypto.randomUUID(),
  organizationId: crypto.randomUUID(),
};
const fields: DraftFields = {
  step: 2,
  search: 'Perfume',
  cart: { TEST: 2 },
  customerId: '',
  mode: 'DELIVERY',
  address: 'Rua TEST, 120',
  expectedDate: '',
  notes: 'Avisar antes',
  discount: '0',
  payKind: 'LATER',
  paid: '0',
  method: 'PIX',
  agreement: 'Pagar no mês',
  parts: [{ amount: '', dueDate: '' }],
};
const snapshot: Snapshot = {
  ...scope,
  owner: 'TEST',
  serverAt: new Date().toISOString(),
  products: [],
  customers: [],
  sales: [],
  conflicts: [],
};
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  await saveSnapshot(snapshot);
});
afterEach(() => vi.unstubAllGlobals());
it('preserva preenchimento incompleto e chave de envio entre reaberturas', async () => {
  const id = crypto.randomUUID();
  const saved = await saveOrderDraft(
    scope,
    { id, fields, submission: { idempotencyKey: id, orderId: id, paid: '0' } },
    null,
  );
  const reopened = await readOrderDraft(scope);
  expect(reopened).toEqual(saved);
  expect(reopened?.fields.parts[0].amount).toBe('');
  expect(reopened?.submission?.idempotencyKey).toBe(id);
});
it('duas abas não sobrescrevem alterações silenciosamente', async () => {
  const first = await saveOrderDraft(
    scope,
    { id: crypto.randomUUID(), fields },
    null,
  );
  const attempts = await Promise.allSettled([
    saveOrderDraft(
      scope,
      { ...first, fields: { ...fields, address: 'A' } },
      first,
    ),
    saveOrderDraft(
      scope,
      { ...first, fields: { ...fields, address: 'B' } },
      first,
    ),
  ]);
  expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await readOrderDraft(scope))?.revision).toBe(2);
});
it('isola contas e bloqueia acesso após saída, preservando o rascunho', async () => {
  const first = await saveOrderDraft(
    scope,
    { id: crypto.randomUUID(), fields },
    null,
  );
  await expect(
    readOrderDraft({ ...scope, userId: crypto.randomUUID() }),
  ).rejects.toThrow('conta');
  await lockLocalAccount();
  await expect(saveOrderDraft(scope, first, first)).rejects.toThrow('conta');
  await expect(readOrderDraft(scope)).rejects.toThrow('conta');
});
it('um envio antigo não apaga nem recria outro rascunho após descarte', async () => {
  const first = await saveOrderDraft(
    scope,
    { id: crypto.randomUUID(), fields },
    null,
  );
  await deleteOrderDraft(scope, first);
  const next = await saveOrderDraft(
    scope,
    { id: crypto.randomUUID(), fields: { ...fields, cart: {} } },
    null,
  );
  await expect(saveOrderDraft(scope, first, first)).rejects.toThrow(
    'outra aba',
  );
  await expect(deleteOrderDraft(scope, first)).rejects.toThrow('outra aba');
  expect((await readOrderDraft(scope))?.id).toBe(next.id);
});
it('a migração IndexedDB mantém os registros existentes da versão 1', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('revenda-offline-v1', 1);
    request.onupgradeneeded = () =>
      ['meta', 'commands', 'records'].forEach((name) =>
        request.result.createObjectStore(name),
      );
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['records'], 'readwrite');
    tx.objectStore('records').put('preserved', 'TEST');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
  await saveSnapshot(snapshot);
  await saveOrderDraft(scope, { id: crypto.randomUUID(), fields }, null);
  const reopened = await new Promise<IDBDatabase>((resolve) => {
    const r = indexedDB.open('revenda-offline-v1', 2);
    r.onsuccess = () => resolve(r.result);
  });
  const value = await new Promise((resolve) => {
    const r = reopened
      .transaction('records')
      .objectStore('records')
      .get('TEST');
    r.onsuccess = () => resolve(r.result);
  });
  reopened.close();
  expect(value).toBe('preserved');
});

it('rascunho preserva nome livre e identificador estável do cliente novo', async () => {
  const quickCustomerId = crypto.randomUUID();
  await saveOrderDraft(
    scope,
    {
      id: crypto.randomUUID(),
      fields: {
        ...fields,
        customerName: 'Ana TEST',
        customerPhone: '16999990000',
        quickCustomerId,
        forceNewCustomer: true,
      },
    },
    null,
  );
  const saved = await readOrderDraft(scope);
  expect(saved?.fields.quickCustomerId).toBe(quickCustomerId);
  expect(saved?.fields.customerName).toBe('Ana TEST');
  expect(saved?.fields.forceNewCustomer).toBe(true);
});

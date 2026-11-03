import type { Command } from './contracts';
export type Scope = { userId: string; organizationId: string };
export type LocalCommand = Command & {
  scope: string;
  state: 'PENDING' | 'APPLIED' | 'ATTENTION' | 'WAITING';
  attempts: number;
  nextAttemptAt: number;
  message?: string;
  resultId?: string;
};
export type Snapshot = Scope & {
  owner: string;
  serverAt: string;
  products: {
    id: string;
    name: string;
    sku: string;
    stock: number;
    reserved: number;
    active: boolean;
    salePrice: string;
  }[];
  customers: { id: string; name: string; active: boolean }[];
  sales: {
    id: string;
    customerId: string | null;
    total: string;
    status: string;
    fulfillmentMode: string;
    fulfillmentStatus: string;
    version: number;
    expectedDate?: string | null;
    items: { productName: string; quantity: number; unitPrice: string }[];
    payments: { id?: string; amount: string }[];
  }[];
  conflicts: { id: string; type: string; message: string | null }[];
};
export const scopeKey = (scope: Scope) =>
  `${scope.userId}:${scope.organizationId}`;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('revenda-offline-v1', 1);
    request.onupgradeneeded = () => {
      for (const name of ['meta', 'commands', 'records'])
        request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(
  stores: string[],
  work: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await open();
  try {
    const tx = database.transaction(stores, 'readwrite');
    const completed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error || new Error('Gravação local cancelada.'));
      tx.onerror = () => reject(tx.error);
    });
    try {
      const result = await work(tx);
      await completed;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      await completed.catch(() => {});
      throw error;
    }
  } finally {
    database.close();
  }
}
export async function activeScope(): Promise<Scope | undefined> {
  return transaction(['meta'], (tx) =>
    requestValue(tx.objectStore('meta').get('active')),
  );
}
export async function lockLocalAccount() {
  await transaction(['meta'], async (tx) => {
    const store = tx.objectStore('meta');
    const state = await requestValue<{ generation: number } | undefined>(
      store.get('preparation'),
    );
    store.delete('active');
    store.put(
      { generation: (state?.generation || 0) + 1, locked: true },
      'preparation',
    );
  });
}
export async function preparationState(): Promise<{
  generation: number;
  locked: boolean;
}> {
  return transaction(
    ['meta'],
    async (tx) =>
      (await requestValue(tx.objectStore('meta').get('preparation'))) || {
        generation: 0,
        locked: false,
      },
  );
}
/** Só uma preparação confirmada na mesma geração pode ativar a partição.
 * Após bloqueio, requer ação explícita em uma tela autenticada. */
export async function prepareSnapshot(
  snapshot: Snapshot,
  expectedGeneration: number,
  explicit = false,
): Promise<boolean> {
  return transaction(['meta'], async (tx) => {
    const store = tx.objectStore('meta');
    const state = (await requestValue<
      { generation: number; locked: boolean } | undefined
    >(store.get('preparation'))) || { generation: 0, locked: false };
    if (state.generation !== expectedGeneration || (state.locked && !explicit))
      return false;
    store.put(snapshot, `snapshot:${scopeKey(snapshot)}`);
    store.put(
      { userId: snapshot.userId, organizationId: snapshot.organizationId },
      'active',
    );
    store.put(
      { generation: state.generation + 1, locked: false },
      'preparation',
    );
    return true;
  });
}
export async function saveSnapshot(snapshot: Snapshot, activate = true) {
  if (activate) {
    const state = await preparationState();
    await prepareSnapshot(snapshot, state.generation);
    return;
  }
  await transaction(['meta'], async (tx) => {
    tx.objectStore('meta').put(snapshot, `snapshot:${scopeKey(snapshot)}`);
  });
}
export async function localSnapshot(
  scope: Scope,
): Promise<Snapshot | undefined> {
  return transaction(['meta'], (tx) =>
    requestValue(tx.objectStore('meta').get(`snapshot:${scopeKey(scope)}`)),
  );
}
export async function localCommands(scope: Scope): Promise<LocalCommand[]> {
  const all = await transaction(['commands'], (tx) =>
    requestValue<LocalCommand[]>(tx.objectStore('commands').getAll()),
  );
  return all.filter((command) => command.scope === scopeKey(scope));
}
/** O registro provisório e sua intenção são confirmados no MESMO commit IDB. */
export async function enqueue(command: Command) {
  const value: LocalCommand = {
    ...command,
    scope: scopeKey(command),
    state: 'PENDING',
    attempts: 0,
    nextAttemptAt: 0,
  };
  await transaction(['commands', 'records'], async (tx) => {
    const old = await requestValue<LocalCommand | undefined>(
      tx.objectStore('commands').get(command.id),
    );
    if (old) {
      if (
        JSON.stringify(old.payload) !== JSON.stringify(command.payload) ||
        old.scope !== value.scope
      )
        throw new Error('Chave local já utilizada com outros dados.');
      return;
    }
    tx.objectStore('records').add(
      { scope: value.scope, type: value.type, payload: value.payload },
      command.id,
    );
    tx.objectStore('commands').add(value, command.id);
  });
}
export async function updateCommand(command: LocalCommand) {
  await transaction(['commands'], async (tx) => {
    tx.objectStore('commands').put(command, command.id);
  });
}
export async function acquireLease(
  scope: Scope,
  holder: string,
  now = Date.now(),
): Promise<boolean> {
  return transaction(['meta'], async (tx) => {
    const store = tx.objectStore('meta'),
      key = `lease:${scopeKey(scope)}`;
    const lease = await requestValue<
      { holder: string; until: number } | undefined
    >(store.get(key));
    if (lease && lease.until > now && lease.holder !== holder) return false;
    store.put({ holder, until: now + 30000 }, key);
    return true;
  });
}
export async function releaseLease(scope: Scope, holder: string) {
  await transaction(['meta'], async (tx) => {
    const store = tx.objectStore('meta'),
      key = `lease:${scopeKey(scope)}`;
    const lease = await requestValue<{ holder: string } | undefined>(
      store.get(key),
    );
    if (lease?.holder === holder) store.delete(key);
  });
}

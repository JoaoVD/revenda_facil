import { z } from 'zod';
import {
  transaction,
  requestValue,
  scopeKey,
  type Scope,
} from '@/modules/sync/local-store';
export const draftFields = z.object({
  step: z.number().int().min(1).max(3),
  search: z.string().max(200),
  cart: z
    .record(z.string(), z.number().int().min(0).max(1000000))
    .refine((v) => Object.keys(v).length <= 100),
  customerId: z.string().max(40),
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().max(20).optional(),
  quickCustomerId: z.string().max(40).optional(),
  forceNewCustomer: z.boolean().optional(),
  mode: z.string().max(20),
  address: z.string().max(500),
  expectedDate: z.string().max(10),
  notes: z.string().max(500),
  discount: z.string().max(30),
  payKind: z.string().max(20),
  paid: z.string().max(30),
  method: z.string().max(20),
  agreement: z.string().max(500),
  parts: z
    .array(
      z.object({ amount: z.string().max(30), dueDate: z.string().max(10) }),
    )
    .max(60),
});
export type DraftFields = z.infer<typeof draftFields>;
export type OrderDraft = {
  id: string;
  revision: number;
  updatedAt: string;
  fields: DraftFields;
  submission?: Record<string, unknown>;
};
type Identity = Pick<OrderDraft, 'id' | 'revision'>;
async function authorize(tx: IDBTransaction, scope: Scope) {
  const active = await requestValue<Scope | undefined>(
    tx.objectStore('meta').get('active'),
  );
  if (!active || scopeKey(active) !== scopeKey(scope))
    throw new Error(
      'Prepare ou libere a cópia local desta conta para usar rascunhos.',
    );
}
export async function readOrderDraft(
  scope: Scope,
): Promise<OrderDraft | undefined> {
  return transaction(['meta', 'drafts'], async (tx) => {
    await authorize(tx, scope);
    return requestValue(tx.objectStore('drafts').get(scopeKey(scope)));
  });
}
export async function saveOrderDraft(
  scope: Scope,
  data: Omit<OrderDraft, 'revision' | 'updatedAt'>,
  expected: Identity | null,
): Promise<OrderDraft> {
  const fields = draftFields.parse(data.fields);
  if (JSON.stringify(data.submission || {}).length > 128000)
    throw new Error('Rascunho muito grande.');
  return transaction(['meta', 'drafts'], async (tx) => {
    await authorize(tx, scope);
    const store = tx.objectStore('drafts');
    const old = await requestValue<OrderDraft | undefined>(
      store.get(scopeKey(scope)),
    );
    if (
      old
        ? !expected ||
          old.id !== expected.id ||
          old.revision !== expected.revision
        : Boolean(expected)
    )
      throw new Error(
        'Este rascunho mudou em outra aba. Reabra o pedido antes de editar.',
      );
    const saved = {
      ...data,
      fields,
      revision: (old?.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    store.put(saved, scopeKey(scope));
    return saved;
  });
}
export async function deleteOrderDraft(scope: Scope, expected: Identity) {
  await transaction(['meta', 'drafts'], async (tx) => {
    await authorize(tx, scope);
    const store = tx.objectStore('drafts');
    const old = await requestValue<OrderDraft | undefined>(
      store.get(scopeKey(scope)),
    );
    if (!old) return;
    if (old.id !== expected.id || old.revision !== expected.revision)
      throw new Error('Rascunho atualizado em outra aba. Não foi removido.');
    store.delete(scopeKey(scope));
  });
}

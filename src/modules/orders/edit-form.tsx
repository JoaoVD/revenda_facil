'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
import { brl, D } from '@/lib/money';
export type EditableOrder = {
  id: string;
  version: number;
  customerId: string;
  fulfillmentMode: string;
  address: string;
  expectedDate: string;
  deliveryNotes: string;
  agreementNotes: string;
  discount: string;
  received: string;
  items: { productId: string; quantity: number; price: string; name: string }[];
  installments: { amount: string; dueDate: string }[];
};
export function EditOrderForm({
  order,
  products,
  customers,
}: {
  order: EditableOrder;
  products: { id: string; name: string; price: string; stock: number }[];
  customers: { id: string; name: string }[];
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [items, setItems] = useState(order.items);
  const [selected, setSelected] = useState(''),
    [discount, setDiscount] = useState(order.discount),
    [mode, setMode] = useState(order.fulfillmentMode);
  const [parts, setParts] = useState(order.installments),
    router = useRouter();
  const total = items
    .reduce((sum, i) => sum.plus(D(i.price).mul(i.quantity)), D(0))
    .minus(discount || '0');
  return (
    <OperationForm
      operation="edit-order"
      button="Salvar alterações do pedido"
      reset={false}
      onSuccess={() => router.push(`/pedidos/${order.id}`)}
      transform={(data) => ({
        ...Object.fromEntries(data),
        idempotencyKey: key,
        saleId: order.id,
        expectedVersion: order.version,
        expectedTotal: total.toFixed(2),
        discount: discount || '0',
        fulfillmentMode: mode,
        expectedDate: String(data.get('expectedDate') || '') || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        installments: parts.map((p) => ({
          amount: p.amount,
          dueDate: p.dueDate || undefined,
        })),
      })}
    >
      <p className="notice">
        A alteração ajusta somente as reservas. Produtos já presentes mantêm
        seus preços e custos históricos. Recebimentos anteriores permanecem
        registrados.
      </p>
      <div className="stack">
        {items.map((item) => (
          <div className="installment-fields" key={item.productId}>
            <p>
              <strong>{item.name}</strong>
              <br />
              {brl(item.price)} por unidade
            </p>
            <Field
              label={`Quantidade de ${item.name}`}
              type="number"
              min="1"
              max="1000000"
              value={item.quantity}
              required
              onChange={(e) =>
                setItems((old) =>
                  old.map((i) =>
                    i.productId === item.productId
                      ? { ...i, quantity: Number(e.target.value) }
                      : i,
                  ),
                )
              }
            />
            <button
              className="small-button"
              type="button"
              onClick={() =>
                setItems((old) =>
                  old.filter((i) => i.productId !== item.productId),
                )
              }
            >
              Remover produto
            </button>
          </div>
        ))}
      </div>
      <Select
        label="Acrescentar produto"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Selecione</option>
        {products
          .filter((p) => !items.some((i) => i.productId === p.id))
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {brl(p.price)} · {p.stock} disponíveis
            </option>
          ))}
      </Select>
      <button
        type="button"
        className="small-button"
        disabled={!selected}
        onClick={() => {
          const product = products.find((p) => p.id === selected);
          if (product)
            setItems((old) => [
              ...old,
              {
                productId: product.id,
                quantity: 1,
                price: product.price,
                name: product.name,
              },
            ]);
          setSelected('');
        }}
      >
        Adicionar produto
      </button>
      <Select
        label="Cliente"
        name="customerId"
        defaultValue={order.customerId}
        required
      >
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select
        label="Atendimento"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <option value="DELIVERY">Entrega</option>
        <option value="PICKUP">Retirada</option>
      </Select>
      <Field
        label="Endereço de entrega"
        name="address"
        defaultValue={order.address}
        required={mode === 'DELIVERY'}
        maxLength={500}
      />
      <Field
        label="Previsão opcional"
        name="expectedDate"
        type="date"
        defaultValue={order.expectedDate}
      />
      <Field
        label="Observações do atendimento"
        name="deliveryNotes"
        defaultValue={order.deliveryNotes}
        maxLength={500}
      />
      <Field
        label="Desconto (R$)"
        type="number"
        min="0"
        step="0.01"
        value={discount}
        onChange={(e) => setDiscount(e.target.value)}
      />
      <div className="order-total">
        <span>Novo total</span>
        <strong>{brl(total)}</strong>
      </div>
      <p>
        Já recebido: {brl(order.received)} · Saldo após alteração:{' '}
        {brl(total.minus(order.received))}
      </p>
      <Field
        label="Observação do acordo"
        name="agreementNotes"
        defaultValue={order.agreementNotes}
        maxLength={500}
      />
      <h3>Parcelas ainda a receber</h3>
      <p className="hint">
        Ao salvar, o plano anterior ficará no histórico. Confirme abaixo o novo
        combinado. Sem parcelas, o saldo fica em aberto.
      </p>
      {parts.map((p, index) => (
        <div className="installment-fields" key={index}>
          <Field
            label={`${index + 1}ª parcela (R$)`}
            type="number"
            min="0.01"
            step="0.01"
            value={p.amount}
            required
            onChange={(e) =>
              setParts((old) =>
                old.map((p, i) =>
                  i === index ? { ...p, amount: e.target.value } : p,
                ),
              )
            }
          />
          <Field
            label="Vencimento opcional"
            type="date"
            value={p.dueDate}
            onChange={(e) =>
              setParts((old) =>
                old.map((p, i) =>
                  i === index ? { ...p, dueDate: e.target.value } : p,
                ),
              )
            }
          />
          <button
            type="button"
            className="small-button"
            onClick={() => setParts((old) => old.filter((_, i) => i !== index))}
          >
            Excluir parcela
          </button>
        </div>
      ))}
      <button
        type="button"
        className="small-button"
        disabled={parts.length >= 60}
        onClick={() => setParts((old) => [...old, { amount: '', dueDate: '' }])}
      >
        Adicionar parcela
      </button>
      <Field
        label="Motivo da alteração"
        name="reason"
        required
        minLength={5}
        maxLength={300}
      />
      <label>
        <input type="checkbox" required /> Conferi o atendimento, o total e o
        novo acordo.
      </label>
      <p className="hint">
        Alterações exigem internet. Se a confirmação falhar, confira o pedido
        antes de tentar novamente.
      </p>
    </OperationForm>
  );
}

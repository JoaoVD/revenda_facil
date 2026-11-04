'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Minus, ShoppingCart, Trash2 } from 'lucide-react';
import { operationAction } from '@/app/actions';
import { D, brl, money } from '@/lib/money';
import { CustomerPicker } from '@/modules/customers/customer-picker';
import { Card, Field, Select, Empty } from '@/components/ui';
import type { ProductOption } from '@/modules/products/contracts';
export function SalesTerminal({
  products,
  customers,
}: {
  products: ProductOption[];
  customers: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState(''),
    [cart, setCart] = useState<Record<string, number>>({}),
    [discount, setDiscount] = useState('0'),
    [paid, setPaid] = useState('0'),
    [customer, setCustomer] = useState(''),
    [method, setMethod] = useState('PIX'),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [message, setMessage] = useState(''),
    [pending, start] = useTransition();
  const router = useRouter();
  const [customerName, setCustomerName] = useState(''),
    [customerPhone, setCustomerPhone] = useState(''),
    [quickCustomerId, setQuickCustomerId] = useState(() => crypto.randomUUID()),
    [forceNewCustomer, setForceNewCustomer] = useState(false);
  const selected = products.filter((p) => cart[p.id]);
  const subtotal = selected.reduce(
    (s, p) => s.plus(D(p.salePrice).mul(cart[p.id])),
    D(0),
  );
  const validAmount = (v: string) => (/^\d+(\.\d{0,2})?$/.test(v) ? v : '0');
  const total = subtotal.minus(validAmount(discount));
  const filtered = useMemo(
    () =>
      products.filter((p) =>
        `${p.name} ${p.brand} ${p.sku} ${p.barcode || ''}`
          .toLocaleLowerCase('pt-BR')
          .includes(search.toLocaleLowerCase('pt-BR')),
      ),
    [products, search],
  );
  function add(id: string, delta: number) {
    setCart((c) => {
      const result = { ...c };
      result[id] = Math.max(0, (result[id] || 0) + delta);
      return result;
    });
  }
  return (
    <div className="terminal">
      <Card>
        <div className="section-heading">
          <h2>Escolha os produtos</h2>
          <span className="badge">{products.length} produtos</span>
        </div>
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Buscar produto"
            placeholder="Nome, marca, código ou código de barras"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="product-grid">
          {filtered.map((p, index) => (
            <button
              disabled={p.stock <= 0 || pending}
              className={`product-tile${cart[p.id] ? ' is-selected' : ''}`}
              data-tone={index % 3}
              aria-pressed={Boolean(cart[p.id])}
              key={p.id}
              onClick={() => add(p.id, 1)}
            >
              <span className="product-visual">
                <span className="product-symbol">
                  {p.name.charAt(0).toLocaleUpperCase('pt-BR')}
                </span>
              </span>
              <small>{p.brand || 'PRODUTO'}</small>
              <strong>{p.name}</strong>
              <span className="product-price">{brl(p.salePrice)}</span>
              <small className="stock-indicator">
                {p.stock} em estoque · {p.sku}
              </small>
              <span className="tile-add">
                <Plus size={16} />
                {cart[p.id]
                  ? `${cart[p.id]} na venda · adicionar`
                  : 'Adicionar'}
              </span>
            </button>
          ))}
        </div>
        {!filtered.length && (
          <Empty>
            Nenhum produto encontrado. Cadastre produtos e registre uma compra
            para começar.
          </Empty>
        )}
      </Card>
      <Card className="cart">
        <div className="section-heading cart-heading">
          <h2>
            <ShoppingCart size={20} />
            Sua venda
          </h2>
          <span className="badge cart-count">
            {selected.reduce((s, p) => s + cart[p.id], 0)} itens
          </span>
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (pending || !selected.length) return;
            if (customerName.trim() && customerName.trim().length < 2) {
              setMessage('Informe ao menos dois caracteres para o nome.');
              return;
            }
            if (
              !customer &&
              !forceNewCustomer &&
              customerName.trim() &&
              customers.some((c) =>
                c.name
                  .toLocaleLowerCase('pt-BR')
                  .includes(customerName.trim().toLocaleLowerCase('pt-BR')),
              )
            ) {
              setMessage(
                'Escolha o cliente encontrado ou confirme que é outra pessoa.',
              );
              return;
            }
            start(async () => {
              const result = await operationAction('sale', {
                idempotencyKey: key,
                customerId: customer || undefined,
                newCustomer:
                  !customer && customerName.trim()
                    ? {
                        id: quickCustomerId,
                        name: customerName.trim(),
                        phone: customerPhone.trim(),
                      }
                    : undefined,
                discount: money(validAmount(discount)),
                paid: money(validAmount(paid)),
                method,
                items: selected.map((p) => ({
                  productId: p.id,
                  quantity: cart[p.id],
                })),
              });
              setMessage(result.message);
              if (result.ok) {
                setCart({});
                setCustomer('');
                setCustomerName('');
                setCustomerPhone('');
                setForceNewCustomer(false);
                setQuickCustomerId(crypto.randomUUID());
                setDiscount('0');
                setPaid('0');
                setKey(crypto.randomUUID());
                router.refresh();
              }
            });
          }}
        >
          {!selected.length ? (
            <Empty>Adicione produtos para começar sua venda.</Empty>
          ) : (
            selected.map((p) => (
              <div className="cart-item" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <small>{brl(p.salePrice)} cada</small>
                </div>
                <div className="quantity">
                  <button
                    type="button"
                    aria-label={`Remover uma unidade de ${p.name}`}
                    onClick={() => add(p.id, -1)}
                  >
                    <Minus size={14} />
                  </button>
                  <span>{cart[p.id]}</span>
                  <button
                    type="button"
                    aria-label={`Adicionar uma unidade de ${p.name}`}
                    onClick={() => add(p.id, 1)}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${p.name}`}
                    onClick={() => setCart((c) => ({ ...c, [p.id]: 0 }))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
          <div className="cart-subtotal">
            <span>Subtotal</span>
            <strong>{brl(subtotal.toString())}</strong>
          </div>
          <Field
            label="Desconto na venda (R$)"
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            required
          />
          <div className="cart-total">
            <span>Total</span>
            <strong>{brl(total.toString())}</strong>
          </div>
          <CustomerPicker
            customers={customers}
            name={customerName}
            selectedId={customer}
            phone={customerPhone}
            forceNew={forceNewCustomer}
            onName={(name) => {
              setCustomerName(name);
              setCustomer('');
              setForceNewCustomer(false);
            }}
            onSelect={(id, name) => {
              setCustomer(id);
              setCustomerName(name);
              setForceNewCustomer(false);
            }}
            onPhone={setCustomerPhone}
            onForceNew={() => {
              setCustomer('');
              setForceNewCustomer(true);
            }}
          />
          <Select
            label="Forma de pagamento do recebimento"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="PIX">Pix</option>
            <option value="CASH">Dinheiro</option>
            <option value="CARD">Cartão (valor recebido)</option>
            <option value="CREDIT">A prazo / fiado</option>
          </Select>
          <Field
            label="Valor recebido agora (R$)"
            type="number"
            min="0"
            step="0.01"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            required
          />
          <button
            type="button"
            className="text-button"
            onClick={() => setPaid(money(total.gte(0) ? total : 0))}
          >
            Preencher valor total recebido
          </button>
          <p className="hint">
            Para deixar saldo a receber, informe ou selecione um cliente. Venda
            no cartão só entra no caixa quando o recebimento for registrado.
          </p>
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <button className="button" disabled={pending || !selected.length}>
            {pending ? 'Finalizando…' : 'Finalizar venda'}
          </button>
        </form>
      </Card>
    </div>
  );
}

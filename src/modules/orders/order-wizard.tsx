'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Plus, Minus, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { operationAction, type Result } from '@/app/actions';
import { Field, Select, Card } from '@/components/ui';
import { brl, D } from '@/lib/money';
import type { ProductOption } from '@/modules/products/contracts';

export function OrderWizard({
  products,
  customers,
  commit,
  onConfirmed,
  provisional = false,
}: {
  products: ProductOption[];
  customers: { id: string; name: string }[];
  commit?: (payload: Record<string, unknown>) => Promise<Result>;
  onConfirmed?: (id: string) => void;
  provisional?: boolean;
}) {
  const [step, setStep] = useState(1),
    [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerId, setCustomer] = useState(''),
    [mode, setMode] = useState('DELIVERY');
  const [address, setAddress] = useState(''),
    [expectedDate, setDate] = useState(''),
    [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0'),
    [payKind, setPayKind] = useState('LATER'),
    [paid, setPaid] = useState('0');
  const [method, setMethod] = useState('PIX'),
    [agreement, setAgreement] = useState('');
  const [parts, setParts] = useState<{ amount: string; dueDate: string }[]>([]);
  const [key] = useState(() => crypto.randomUUID()),
    [message, setMessage] = useState('');
  const [pending, start] = useTransition(),
    router = useRouter();
  const items = products.filter((p) => cart[p.id] > 0);
  const subtotal = items.reduce(
    (sum, p) => sum.plus(D(p.salePrice).mul(cart[p.id])),
    D(0),
  );
  const total = subtotal.minus(discount || '0');
  const received =
    payKind === 'ALL'
      ? total.toFixed(2)
      : payKind === 'LATER'
        ? '0'
        : paid || '0';
  const balance = total.minus(received);
  const count = items.reduce((sum, p) => sum + cart[p.id], 0);
  function change(id: string, quantity: number) {
    setCart((old) => ({ ...old, [id]: Math.max(0, quantity) }));
  }
  function submit() {
    if (!count || total.lt(0) || balance.lt(0)) {
      setMessage('Confira os produtos, desconto e recebimento.');
      return;
    }
    start(async () => {
      try {
        const payload = {
          idempotencyKey: key,
          customerId: customerId || undefined,
          fulfillmentMode: mode,
          address,
          expectedDate: expectedDate || undefined,
          deliveryNotes: notes,
          agreementNotes: agreement,
          discount: discount || '0',
          paid: received,
          method,
          installments: balance.gt(0)
            ? parts.map((p) => ({
                amount: p.amount,
                dueDate: p.dueDate || undefined,
              }))
            : [],
          items: items.map((p) => ({ productId: p.id, quantity: cart[p.id] })),
        };
        const result = commit
          ? await commit(payload)
          : await operationAction('sale', payload);
        if (result.ok && result.id) {
          if (onConfirmed) onConfirmed(result.id);
          else {
            router.push(`/pedidos/${result.id}`);
            router.refresh();
          }
        } else setMessage(result.message);
      } catch {
        setMessage(
          'Não foi possível confirmar no servidor. Seu preenchimento foi mantido; tente novamente.',
        );
      }
    });
  }
  return (
    <div className="order-editor">
      <section
        className={`order-catalog ${step !== 1 ? 'mobile-step-hidden' : ''}`}
      >
        <p className="step-label">1 de 3 · Escolher produtos</p>
        <Field
          label="Buscar produto ou marca"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nome, marca ou código"
        />
        <div className="order-products">
          {products
            .filter((p) =>
              `${p.name} ${p.brand} ${p.sku} ${p.barcode || ''}`
                .toLocaleLowerCase('pt-BR')
                .includes(search.toLocaleLowerCase('pt-BR')),
            )
            .map((p) => (
              <article className="order-product" key={p.id}>
                {p.imageUrl ? (
                  <Image
                    className="order-photo"
                    src={p.imageUrl}
                    alt={p.name}
                    width={68}
                    height={76}
                    unoptimized
                  />
                ) : (
                  <div
                    className="order-placeholder"
                    aria-label="Produto sem foto"
                  >
                    <Package size={30} strokeWidth={1.3} />
                  </div>
                )}
                <div>
                  <h3>{p.name}</h3>
                  <small>{p.brand || p.sku}</small>
                  <strong>{brl(p.salePrice)}</strong>
                  <small>{p.stock} disponíveis</small>
                </div>
                <div className="quantity-control">
                  {cart[p.id] > 0 && (
                    <>
                      <button
                        type="button"
                        aria-label={`Remover ${p.name}`}
                        onClick={() => change(p.id, cart[p.id] - 1)}
                      >
                        <Minus size={18} />
                      </button>
                      <span>{cart[p.id]}</span>
                    </>
                  )}
                  <button
                    type="button"
                    aria-label={`Adicionar ${p.name}`}
                    disabled={(cart[p.id] || 0) >= p.stock}
                    onClick={() => change(p.id, (cart[p.id] || 0) + 1)}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </article>
            ))}
          {!products.length && (
            <p className="empty">
              Cadastre produtos e receba mercadorias para começar.
            </p>
          )}
        </div>
      </section>
      <Card className="order-summary">
        <h2>Seu pedido</h2>
        <ul className="order-lines">
          {items.map((p) => (
            <li key={p.id}>
              <span>
                {cart[p.id]} × {p.name}
              </span>
              <strong>{brl(D(p.salePrice).mul(cart[p.id]))}</strong>
            </li>
          ))}
        </ul>
        <div className={step !== 2 ? 'mobile-step-hidden' : ''}>
          <p className="step-label">2 de 3 · Cliente e atendimento</p>
          <Select
            label="Cliente"
            value={customerId}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="">Selecione</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <a
            className="text-link"
            href="/clientes"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cadastrar cliente em outra aba
          </a>
          <Select
            label="Como será o atendimento?"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="DELIVERY">Entrega</option>
            <option value="PICKUP">Retirada</option>
            <option value="IMMEDIATE">Venda imediata · já entregue</option>
          </Select>
          {mode !== 'IMMEDIATE' && (
            <>
              <Field
                label="Previsão (opcional)"
                type="date"
                value={expectedDate}
                onChange={(e) => setDate(e.target.value)}
              />
              {mode === 'DELIVERY' && (
                <Field
                  label="Endereço de entrega"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  maxLength={500}
                />
              )}
              <Field
                label="Observações do atendimento"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
            </>
          )}
          <Field
            label="Desconto no pedido (R$)"
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>
        <div className={step !== 3 ? 'mobile-step-hidden' : ''}>
          <p className="step-label">3 de 3 · Pagamento e confirmação</p>
          <Select
            label="Recebimento"
            value={payKind}
            onChange={(e) => setPayKind(e.target.value)}
          >
            <option value="LATER">Vai receber depois</option>
            <option value="PART">Recebeu uma parte</option>
            <option value="ALL">Recebeu tudo</option>
          </Select>
          {payKind === 'PART' && (
            <Field
              label="Valor já recebido (R$)"
              type="number"
              min="0.01"
              step="0.01"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
            />
          )}
          {payKind !== 'LATER' && (
            <Select
              label="Meio do recebimento"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="PIX">Pix</option>
              <option value="CASH">Dinheiro</option>
              <option value="CARD">Cartão</option>
            </Select>
          )}
          {balance.gt(0) && (
            <>
              <Field
                label="Observação do acordo"
                value={agreement}
                onChange={(e) => setAgreement(e.target.value)}
                maxLength={500}
              />
              <p className="hint">
                Sem parcelas, o saldo fica em aberto, sem vencimento. Com
                parcelas, a soma deve ser {brl(balance)}.
              </p>
              {parts.map((part, index) => (
                <div className="installment-fields" key={index}>
                  <Field
                    label={`${index + 1}ª parcela (R$)`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={part.amount}
                    onChange={(e) =>
                      setParts((old) =>
                        old.map((p, i) =>
                          i === index ? { ...p, amount: e.target.value } : p,
                        ),
                      )
                    }
                  />
                  <Field
                    label="Data opcional"
                    type="date"
                    value={part.dueDate}
                    onChange={(e) =>
                      setParts((old) =>
                        old.map((p, i) =>
                          i === index ? { ...p, dueDate: e.target.value } : p,
                        ),
                      )
                    }
                  />
                  <button
                    className="small-button"
                    type="button"
                    aria-label={`Excluir parcela ${index + 1}`}
                    onClick={() =>
                      setParts((old) => old.filter((_, i) => i !== index))
                    }
                  >
                    Excluir
                  </button>
                </div>
              ))}
              <button
                className="small-button"
                type="button"
                disabled={parts.length >= 60}
                onClick={() =>
                  setParts((old) => [...old, { amount: '', dueDate: '' }])
                }
              >
                + Parcela
              </button>
            </>
          )}
        </div>
        <div className="order-total">
          <span>Total · {count} unidades</span>
          <strong>{brl(total)}</strong>
        </div>
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <p className="hint">
          {provisional
            ? 'Salvo neste aparelho. Estoque e valores serão validados ao sincronizar; a reserva é provisória e pode precisar de conferência.'
            : mode === 'IMMEDIATE'
              ? 'Confirma a saída física agora.'
              : 'Confirma e reserva estoque. A baixa ocorrerá ao concluir o atendimento.'}{' '}
          Entrega e recebimento são independentes.
        </p>
        <div className="order-actions">
          {step > 1 && (
            <button
              className="small-button mobile-only"
              type="button"
              disabled={pending}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
          {step < 3 && (
            <button
              className="button mobile-only"
              type="button"
              disabled={!count}
              onClick={() => setStep(step + 1)}
            >
              Continuar · {brl(total)}
            </button>
          )}
          <button
            className={`button ${step !== 3 ? 'mobile-step-hidden' : ''}`}
            type="button"
            disabled={pending || !count}
            onClick={submit}
          >
            {pending ? 'Confirmando…' : 'Confirmar pedido'}
          </button>
        </div>
      </Card>
    </div>
  );
}

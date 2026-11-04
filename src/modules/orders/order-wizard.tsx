'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Plus, Minus, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { operationAction, type Result } from '@/app/actions';
import { Field, Select, Card } from '@/components/ui';
import { brl, D } from '@/lib/money';
import type { ProductOption } from '@/modules/products/contracts';
import { localCommands, type Scope } from '@/modules/sync/local-store';
import { CustomerPicker } from '@/modules/customers/customer-picker';
import { useOrderDraft } from './use-order-draft';

export function OrderWizard({
  products,
  customers,
  commit,
  onConfirmed,
  provisional = false,
  scope,
}: {
  products: ProductOption[];
  customers: { id: string; name: string; phone?: string | null }[];
  commit?: (payload: Record<string, unknown>) => Promise<Result>;
  onConfirmed?: (id: string) => void;
  provisional?: boolean;
  scope?: Scope;
}) {
  const [step, setStep] = useState(1),
    [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerId, setCustomer] = useState(''),
    [mode, setMode] = useState('DELIVERY');
  const [customerName, setCustomerName] = useState(''),
    [customerPhone, setCustomerPhone] = useState(''),
    [quickCustomerId, setQuickCustomerId] = useState(() => crypto.randomUUID()),
    [forceNewCustomer, setForceNewCustomer] = useState(false);
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
  const submitting = useRef(false);
  const draft = useOrderDraft(
    scope,
    {
      step,
      search,
      cart,
      customerId,
      customerName,
      customerPhone,
      quickCustomerId,
      forceNewCustomer,
      mode,
      address,
      expectedDate,
      notes,
      discount,
      payKind,
      paid,
      method,
      agreement,
      parts,
    },
    (value) => {
      setStep(value.step);
      setSearch(value.search);
      setCart(value.cart);
      setCustomer(value.customerId);
      setCustomerName(
        value.customerName ??
          customers.find((c) => c.id === value.customerId)?.name ??
          '',
      );
      setCustomerPhone(value.customerPhone || '');
      setQuickCustomerId(value.quickCustomerId || crypto.randomUUID());
      setForceNewCustomer(value.forceNewCustomer || false);
      setMode(value.mode);
      setAddress(value.address);
      setDate(value.expectedDate);
      setNotes(value.notes);
      setDiscount(value.discount);
      setPayKind(value.payKind);
      setPaid(value.paid);
      setMethod(value.method);
      setAgreement(value.agreement);
      setParts(value.parts);
    },
  );
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
  const unavailable = Object.keys(cart).filter(
    (id) => cart[id] > 0 && !products.some((p) => p.id === id),
  );
  function change(id: string, delta: number) {
    const stock = products.find((product) => product.id === id)?.stock || 0;
    setCart((old) => ({
      ...old,
      [id]: Math.max(0, Math.min(stock, (old[id] || 0) + delta)),
    }));
  }
  function submit() {
    if (submitting.current || !draft.ready) return;
    if (
      !draft.submission &&
      (!count || total.lt(0) || balance.lt(0) || unavailable.length)
    ) {
      setMessage('Confira os produtos, desconto e recebimento.');
      return;
    }
    if (
      !draft.submission &&
      customerName.trim() &&
      !customerId &&
      !forceNewCustomer &&
      customers.some((c) =>
        c.name
          .trim()
          .toLocaleLowerCase('pt-BR')
          .includes(customerName.trim().toLocaleLowerCase('pt-BR')),
      )
    ) {
      setMessage(
        'Escolha um cliente encontrado ou confirme que é outra pessoa.',
      );
      return;
    }
    if (
      !draft.submission &&
      customerName.trim() &&
      customerName.trim().length < 2
    ) {
      setMessage('Informe ao menos dois caracteres para o nome do cliente.');
      return;
    }
    if (
      !draft.submission &&
      !customerId &&
      !customerName.trim() &&
      (mode !== 'IMMEDIATE' || balance.gt(0))
    ) {
      setMessage(
        'Informe o nome do cliente para acompanhar este pedido ou valor a receber.',
      );
      return;
    }
    submitting.current = true;
    start(async () => {
      try {
        const payload = draft.submission || {
          idempotencyKey: scope ? draft.id : key,
          orderId: scope ? draft.id : undefined,
          expectedTotal: total.toFixed(2),
          customerId: customerId || undefined,
          newCustomer:
            !customerId && customerName.trim()
              ? {
                  id: quickCustomerId,
                  name: customerName.trim(),
                  phone: customerPhone.trim(),
                }
              : undefined,
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
        if (scope && !draft.submission) await draft.saveSubmission(payload);
        const result = commit
          ? await commit(payload)
          : await operationAction('sale', payload);
        if (result.ok && result.id) {
          await draft.complete().catch(() => undefined);
          if (onConfirmed) onConfirmed(result.id);
          else {
            router.push(`/pedidos/${result.id}`);
          }
        } else setMessage(result.message);
      } catch {
        setMessage(
          'Não foi possível confirmar no servidor. Seu preenchimento foi mantido; tente novamente.',
        );
      } finally {
        submitting.current = false;
      }
    });
  }
  return (
    <div>
      {scope && (
        <div className="draft-bar stack">
          <p role="status">{draft.message}</p>
          {!draft.ready && (
            <button
              type="button"
              className="small-button"
              onClick={draft.retry}
            >
              Tentar preparar rascunho
            </button>
          )}
          {draft.submission ? (
            <>
              <p className="notice">
                Há um envio para conferir. Reenviar usa exatamente o mesmo
                pedido, sem criar outra venda.
              </p>
              <p>
                <strong>
                  Total do envio preservado:{' '}
                  {brl(String(draft.submission.expectedTotal || '0'))}
                </strong>{' '}
                · Recebimento informado:{' '}
                {brl(String(draft.submission.paid || '0'))}
              </p>
              <p className="hint">
                Os valores acima pertencem ao envio original e permanecem iguais
                mesmo que o catálogo mude.
              </p>
              <div className="ux-actions">
                <button
                  type="button"
                  className="button"
                  disabled={pending}
                  onClick={submit}
                >
                  Tentar confirmar o mesmo pedido
                </button>
                <button
                  type="button"
                  className="small-button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        const local = (await localCommands(scope)).find(
                          (c) => c.id === draft.id,
                        );
                        if (local) {
                          await draft.complete();
                          if (onConfirmed)
                            onConfirmed(String(local.payload.orderId));
                          else router.push('/operacao');
                          return;
                        }
                        const result = await operationAction('draft-status', {
                          idempotencyKey: draft.id,
                        });
                        if (!result.ok) {
                          setMessage(result.message);
                          return;
                        }
                        if (result.id) {
                          await draft.complete();
                          if (onConfirmed) onConfirmed(result.id);
                          else router.push(`/pedidos/${result.id}`);
                        } else {
                          await draft.unlock();
                          setMessage(
                            'Nenhum pedido confirmado com esta chave. Você pode revisar os dados; a chave original será preservada.',
                          );
                        }
                      } catch {
                        setMessage(
                          'Não foi possível conferir. Seu pedido continua preservado neste aparelho.',
                        );
                      }
                    })
                  }
                >
                  Conferir envio antes de revisar
                </button>
              </div>
            </>
          ) : (
            draft.ready && (
              <button
                type="button"
                className="small-button"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm('Descartar este rascunho ainda não enviado?')
                  )
                    void draft
                      .discard()
                      .catch((error) =>
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : 'Rascunho não removido.',
                        ),
                      );
                }}
              >
                Descartar rascunho
              </button>
            )
          )}
          {message && draft.submission && (
            <p className="error" role="alert">
              {message}
            </p>
          )}
        </div>
      )}
      {!draft.submission && (
        <fieldset
          className="order-editor order-fieldset"
          aria-busy={!draft.ready}
          disabled={pending || !draft.ready || Boolean(draft.submission)}
        >
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
                            onClick={() => change(p.id, -1)}
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
                        onClick={() => change(p.id, 1)}
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
            {unavailable.length > 0 && (
              <p className="notice">
                Há produtos do rascunho fora do catálogo atual. Confira o
                cadastro ou{' '}
                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    setCart((old) =>
                      Object.fromEntries(
                        Object.entries(old).filter(
                          ([id]) => !unavailable.includes(id),
                        ),
                      ),
                    )
                  }
                >
                  Remover indisponíveis do rascunho
                </button>
              </p>
            )}
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
              <CustomerPicker
                customers={customers}
                name={customerName}
                selectedId={customerId}
                phone={customerPhone}
                forceNew={forceNewCustomer}
                onName={(value) => {
                  setCustomerName(value);
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
                              i === index
                                ? { ...p, amount: e.target.value }
                                : p,
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
                              i === index
                                ? { ...p, dueDate: e.target.value }
                                : p,
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
        </fieldset>
      )}
    </div>
  );
}

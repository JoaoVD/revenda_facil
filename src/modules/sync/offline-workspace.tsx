'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Navegação completa permite fallback do service worker sem conexão. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Leaf, Package } from 'lucide-react';
import { Card, Field, Select, Empty } from '@/components/ui';
import { brl, D } from '@/lib/money';
import { netReceived } from '@/modules/finance/ledger';
import { OrderWizard } from '@/modules/orders/order-wizard';
import { synchronize } from './client';
import {
  activeScope,
  localSnapshot,
  localCommands,
  enqueue,
  updateCommand,
  lockLocalAccount,
  type Snapshot,
  type LocalCommand,
} from './local-store';
import type { Command } from './contracts';

export function OfflineWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot>(),
    [commands, setCommands] = useState<LocalCommand[]>([]);
  const [status, setStatus] = useState('Abrindo dados deste aparelho…'),
    [screen, setScreen] = useState('home');
  const [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false);
  const syncing = useRef(false);
  const refresh = useCallback(async () => {
    const scope = await activeScope();
    if (!scope) {
      setSnapshot(undefined);
      setStatus(
        'Entre online para preparar os dados desta conta neste aparelho.',
      );
      return;
    }
    const data = await localSnapshot(scope);
    setSnapshot(data);
    setCommands(await localCommands(scope));
  }, []);
  const sync = useCallback(async () => {
    if (syncing.current) return;
    const scope = await activeScope();
    if (!scope) return;
    syncing.current = true;
    setBusy(true);
    try {
      setStatus(await synchronize(scope));
      await refresh();
    } finally {
      setBusy(false);
      syncing.current = false;
    }
  }, [refresh]);
  useEffect(() => {
    let stopped = false;
    async function resume() {
      if (stopped || document.visibilityState === 'hidden') return;
      try {
        await refresh();
        if (!stopped) await sync();
      } catch {
        if (!stopped)
          setStatus(
            'Não foi possível abrir o armazenamento. Não há confirmação de gravação local.',
          );
      }
    }
    void resume();
    const timer = setInterval(() => void resume(), 10000);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh, sync]);
  async function capture(
    type: Command['type'],
    payload: Record<string, unknown>,
    dependencies: string[] = [],
    commandId = crypto.randomUUID(),
  ) {
    if (!snapshot)
      throw new Error('Prepare a conta online antes de continuar.');
    const active = await activeScope();
    if (
      !active ||
      active.userId !== snapshot.userId ||
      active.organizationId !== snapshot.organizationId
    )
      throw new Error('Conta alterada. Reabra o aplicativo.');
    const original = (await localCommands(snapshot)).find(
      (c) => c.id === commandId,
    );
    await enqueue({
      id: commandId,
      type,
      contractVersion: 1,
      userId: snapshot.userId,
      organizationId: snapshot.organizationId,
      capturedAt: original?.capturedAt || new Date().toISOString(),
      dependencies,
      payload,
    } as Command);
    setStatus('Salvo neste aparelho — aguardando sincronização.');
    await refresh();
  }
  const projected = commands.map((c) => ({
    ...c,
    payload: c.resolvedPayload || c.payload,
  }));
  const unapplied = projected.filter((c) => c.state !== 'APPLIED');
  const pendingOrders = projected.filter(
    (c) =>
      c.type === 'ORDER' &&
      !snapshot?.sales.some((s) => s.id === c.payload.orderId),
  );
  const customers = [
    ...(snapshot?.customers || []).filter((c) => c.active),
    ...projected
      .filter(
        (c) =>
          c.type === 'CUSTOMER' &&
          !snapshot?.customers.some(
            (customer) => customer.id === c.payload.customerId,
          ),
      )
      .map((c) => ({
        id: String(c.payload.customerId),
        name: String(c.payload.name),
        active: true,
      })),
  ];
  const sales = [
    ...(snapshot?.sales || []),
    ...pendingOrders
      .filter((c) => !snapshot?.sales.some((s) => s.id === c.payload.orderId))
      .map((c) => ({
        id: String(c.payload.orderId),
        customerId: String(c.payload.customerId || ''),
        total: String(c.payload.localTotal || '0'),
        status: 'CONFIRMED',
        fulfillmentMode: String(c.payload.fulfillmentMode),
        fulfillmentStatus:
          c.payload.fulfillmentMode === 'IMMEDIATE' ? 'COMPLETED' : 'PENDING',
        version: 1,
        items: (
          c.payload.items as { productId: string; quantity: number }[]
        ).map((i) => ({
          productName:
            snapshot?.products.find((p) => p.id === i.productId)?.name ||
            'Produto',
          quantity: i.quantity,
          unitPrice:
            snapshot?.products.find((p) => p.id === i.productId)?.salePrice ||
            '0',
        })),
        payments: D(String(c.payload.paid || '0')).gt(0)
          ? [{ amount: String(c.payload.paid) }]
          : [],
      })),
  ].map((s) => ({
    ...s,
    fulfillmentStatus: projected.some(
      (c) => c.type === 'DELIVERY' && c.payload.saleId === s.id,
    )
      ? 'COMPLETED'
      : s.fulfillmentStatus,
    payments: [
      ...s.payments,
      ...projected
        .filter(
          (c) =>
            c.type === 'PAYMENT' &&
            c.payload.referenceId === s.id &&
            !s.payments.some((p) => 'id' in p && p.id === c.resultId),
        )
        .map((c) => ({ amount: String(c.payload.amount) })),
    ],
  }));
  const sale = sales.find((s) => s.id === selected);
  const dependency = (id: string) =>
    pendingOrders.filter((c) => c.payload.orderId === id).map((c) => c.id);
  function orderBalance(order: (typeof sales)[number]) {
    return order.status === 'CANCELLED'
      ? D(0)
      : D(order.total).minus(netReceived(order.payments));
  }
  return (
    <div className="device-workspace">
      <header className="device-header">
        <a href="/">
          <Leaf /> <strong>Revenda Fácil</strong>
        </a>
        <small>{snapshot?.owner}</small>
      </header>
      <div className="sync-status" role="status">
        <span>{status}</span>
        <button
          className="small-button"
          disabled={busy}
          onClick={() =>
            void sync().catch(() =>
              setStatus('Não foi possível sincronizar. Fila preservada.'),
            )
          }
        >
          {busy ? 'Conferindo…' : 'Sincronizar agora'}
        </button>
      </div>
      {!snapshot ? (
        <Card>
          <p>{status}</p>
          <a className="button" href="/login">
            Entrar online
          </a>
        </Card>
      ) : (
        <>
          <nav className="day-filters" aria-label="Operação neste aparelho">
            {[
              ['home', 'Início'],
              ['orders', 'Pedidos'],
              ['receive', 'Receber'],
              ['more', 'Mais'],
            ].map(([id, label]) => (
              <button
                className="small-button"
                key={id}
                aria-pressed={screen === id}
                onClick={() => setScreen(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {(screen === 'home' ||
            screen === 'orders' ||
            screen === 'receive') && (
            <>
              <h1>
                {screen === 'home'
                  ? `Olá, ${snapshot.owner.split(' ')[0]}!`
                  : screen === 'receive'
                    ? 'Valores a receber'
                    : 'Pedidos'}
              </h1>
              <button
                className="button day-new"
                onClick={() => setScreen('new')}
              >
                + Novo pedido
              </button>
              <p className="hint">
                Última consulta ao servidor:{' '}
                {new Date(snapshot.serverAt).toLocaleString('pt-BR')}. Reservas
                locais são provisórias. Outros aparelhos podem ter alterado os
                dados.
              </p>
              <div className="order-card-list">
                {sales
                  .filter(
                    (s) =>
                      screen !== 'receive' ||
                      (s.status !== 'CANCELLED' && orderBalance(s).gt(0)),
                  )
                  .map((s) => (
                    <Card key={s.id}>
                      <h2>
                        {customers.find((c) => c.id === s.customerId)?.name ||
                          'Sem cadastro'}
                      </h2>
                      <p>
                        {s.items.reduce((sum, i) => sum + i.quantity, 0)}{' '}
                        unidades · {brl(s.total)}
                      </p>
                      <p>
                        {s.status === 'CANCELLED'
                          ? 'Cancelado'
                          : s.fulfillmentStatus === 'COMPLETED'
                            ? 'Atendimento concluído'
                            : s.fulfillmentMode === 'PICKUP'
                              ? 'Retirada pendente'
                              : 'Entrega pendente'}
                      </p>
                      <p>
                        {s.status === 'CANCELLED'
                          ? 'Cancelado'
                          : orderBalance(s).gt(0)
                            ? `Falta receber ${brl(orderBalance(s))}`
                            : 'Pago'}
                      </p>
                      {unapplied.some(
                        (c) =>
                          c.payload.orderId === s.id ||
                          c.payload.referenceId === s.id ||
                          c.payload.saleId === s.id,
                      ) && (
                        <p className="notice">
                          Salvo neste aparelho · aguardando validação
                        </p>
                      )}
                      <button
                        className="small-button"
                        onClick={() => {
                          setSelected(s.id);
                          setScreen('detail');
                        }}
                      >
                        Ver pedido
                      </button>
                    </Card>
                  ))}
              </div>
            </>
          )}
          {screen === 'new' && (
            <>
              <h1>Novo pedido</h1>
              <button
                className="small-button"
                onClick={() => setScreen('customer')}
              >
                Cadastrar cliente
              </button>
              <OrderWizard
                scope={{
                  userId: snapshot.userId,
                  organizationId: snapshot.organizationId,
                }}
                provisional
                customers={customers}
                products={snapshot.products
                  .filter((p) => p.active)
                  .map((p) => ({
                    ...p,
                    stock: Math.max(
                      0,
                      p.stock -
                        p.reserved -
                        pendingOrders.reduce(
                          (sum, c) =>
                            sum +
                            ((
                              c.payload.items as {
                                productId: string;
                                quantity: number;
                              }[]
                            ).find((i) => i.productId === p.id)?.quantity || 0),
                          0,
                        ),
                    ),
                    brand: '',
                    barcode: null,
                    referenceCost: '0',
                  }))}
                commit={async (payload) => {
                  const orderId = String(
                      payload.orderId || crypto.randomUUID(),
                    ),
                    commandId = String(payload.idempotencyKey);
                  const items = payload.items as {
                    productId: string;
                    quantity: number;
                  }[];
                  const total = payload.expectedTotal
                    ? String(payload.expectedTotal)
                    : items
                        .reduce(
                          (sum, i) =>
                            sum.plus(
                              D(
                                snapshot.products.find(
                                  (p) => p.id === i.productId,
                                )?.salePrice || '0',
                              ).mul(i.quantity),
                            ),
                          D(0),
                        )
                        .minus(String(payload.discount || '0'))
                        .toFixed(2);
                  const deps = unapplied
                    .filter(
                      (c) =>
                        c.type === 'CUSTOMER' &&
                        c.payload.customerId === payload.customerId,
                    )
                    .map((c) => c.id);
                  await capture(
                    'ORDER',
                    {
                      ...payload,
                      orderId,
                      localTotal: total,
                      expectedTotal: total,
                    },
                    deps,
                    commandId,
                  );
                  return {
                    ok: true,
                    message: 'Salvo neste aparelho.',
                    id: orderId,
                  };
                }}
                onConfirmed={(id) => {
                  setSelected(id);
                  setScreen('detail');
                }}
              />
            </>
          )}
          {screen === 'customer' && (
            <Card>
              <h1>Novo cliente</h1>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    data = new FormData(form);
                  setBusy(true);
                  try {
                    await capture('CUSTOMER', {
                      customerId: crypto.randomUUID(),
                      name: String(data.get('name')),
                      phone: String(data.get('phone')),
                    });
                    setScreen('new');
                  } catch {
                    setStatus(
                      'Falha ao salvar cliente. Não há confirmação local.',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field
                  label="Nome"
                  name="name"
                  minLength={2}
                  maxLength={120}
                  required
                />
                <Field
                  label="Telefone (opcional)"
                  name="phone"
                  maxLength={20}
                />
                <button className="button" disabled={busy}>
                  Salvar neste aparelho
                </button>
              </form>
            </Card>
          )}
          {screen === 'detail' && sale && (
            <>
              <h1>Pedido #{sale.id.slice(0, 8)}</h1>
              <Card>
                <h2>
                  {customers.find((c) => c.id === sale.customerId)?.name ||
                    'Sem cadastro'}
                </h2>
                {sale.items.map((i, index) => (
                  <p key={index}>
                    {i.quantity} × {i.productName} · {brl(i.unitPrice)}
                  </p>
                ))}
                <div className="order-total">
                  <span>Total</span>
                  <strong>{brl(sale.total)}</strong>
                </div>
                <p>
                  {sale.fulfillmentStatus === 'COMPLETED'
                    ? 'Atendimento concluído'
                    : 'Atendimento pendente'}
                </p>
                {sale.status === 'CONFIRMED' &&
                  sale.fulfillmentStatus !== 'COMPLETED' && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await capture(
                            'DELIVERY',
                            { saleId: sale.id, expectedVersion: sale.version },
                            dependency(sale.id),
                          );
                        } catch {
                          setStatus(
                            'Falha ao gravar entrega. Não há confirmação local.',
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Confirmar{' '}
                      {sale.fulfillmentMode === 'PICKUP'
                        ? 'retirada'
                        : 'entrega'}{' '}
                      integral neste aparelho
                    </button>
                  )}
              </Card>
              <Card>
                <h2>Pagamento</h2>
                <p>Líquido recebido: {brl(netReceived(sale.payments))}</p>
                <p>Falta receber: {brl(orderBalance(sale))}</p>
                {sale.status === 'CONFIRMED' && orderBalance(sale).gt(0) && (
                  <form
                    className="stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      setBusy(true);
                      try {
                        const id = crypto.randomUUID();
                        await capture(
                          'PAYMENT',
                          {
                            idempotencyKey: id,
                            kind: 'SALE',
                            referenceId: sale.id,
                            amount: String(data.get('amount')),
                            method: String(data.get('method')),
                            description: 'Recebimento capturado no aparelho',
                          },
                          dependency(sale.id),
                          id,
                        );
                      } catch {
                        setStatus(
                          'Falha ao gravar recebimento. Não há confirmação local.',
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Field
                      label="Valor efetivamente recebido (R$)"
                      name="amount"
                      type="number"
                      min="0.01"
                      max={orderBalance(sale).toFixed(2)}
                      step="0.01"
                      required
                    />
                    <Select label="Meio" name="method">
                      <option value="PIX">Pix</option>
                      <option value="CASH">Dinheiro</option>
                      <option value="CARD">Cartão</option>
                    </Select>
                    <p className="hint">
                      Distribuição sugerida: parcelas em ordem, até cobrir o
                      valor. Ao confirmar, você aceita essa distribuição. O
                      servidor verificará o saldo consolidado.
                    </p>
                    <button className="button" disabled={busy}>
                      Registrar recebimento neste aparelho
                    </button>
                  </form>
                )}
              </Card>
            </>
          )}
          {screen === 'more' && (
            <>
              <Card>
                <h2>Dados deste aparelho</h2>
                <p>
                  Compras, ajustes, cadastros completos e fiscal exigem
                  comunicação com o servidor.
                </p>
                <a className="button" href="/">
                  Abrir Dashboard online
                </a>
                <p>
                  Armazenamento local não é backup. Limpar dados do navegador ou
                  perder o aparelho pode eliminar ações ainda não sincronizadas.
                  Use bloqueio de tela.
                </p>
                <button
                  className="small-button"
                  onClick={async () => {
                    await lockLocalAccount();
                    setSnapshot(undefined);
                    setStatus(
                      'Dados bloqueados neste aparelho. A fila permanece preservada por conta.',
                    );
                  }}
                >
                  Bloquear dados locais
                </button>
              </Card>
              <Card>
                <h2>Ações e conferências</h2>
                <a className="button" href="/pendencias">
                  Conferir pendências com internet
                </a>
                {commands.map((c) => (
                  <div className="local-command" key={c.id}>
                    <strong>
                      {c.type} · {c.state}
                    </strong>
                    <p>
                      {c.message || 'Informação preservada neste aparelho.'}
                    </p>
                    <small>{c.id}</small>
                    {c.state === 'ATTENTION' && (
                      <button
                        className="small-button"
                        onClick={async () => {
                          await updateCommand({
                            ...c,
                            state: 'PENDING',
                            attempts: 0,
                            nextAttemptAt: 0,
                          });
                          await refresh();
                        }}
                      >
                        Tentar consultar novamente
                      </button>
                    )}
                  </div>
                ))}
                {!commands.length && <Empty>Nenhuma ação local.</Empty>}
                {snapshot.conflicts.map((c) => (
                  <p key={c.id}>
                    <Package size={16} /> {c.type}: {c.message}
                  </p>
                ))}
                <p className="hint">
                  Conflitos preservam os fatos no servidor e no aparelho. Abra a
                  conferência online para registrar uma decisão; a confirmação
                  volta a este aparelho na próxima sincronização.
                </p>
              </Card>
            </>
          )}
        </>
      )}
      <footer className="page-footer">
        Servidor é a fonte consolidada. Sincronização ocorre com o aplicativo
        aberto.
      </footer>
    </div>
  );
}

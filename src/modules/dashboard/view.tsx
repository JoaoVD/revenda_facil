import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Package,
  Coins,
  ShoppingCart,
  ArrowRight,
  History,
  Plus,
} from 'lucide-react';
import { D, brl, dateTime } from '@/lib/money';
import { Card, Empty, Table, Badge, PageTitle } from '@/components/ui';
const types: Record<string, string> = {
  SALE: 'Venda',
  RESERVATION: 'Reserva de estoque',
  RESERVATION_RELEASE: 'Reserva liberada',
  PURCHASE: 'Entrada no estoque',
  RETURN: 'Devolução',
  RECEIPT: 'Recebimento',
  PAYMENT: 'Pagamento',
  PRODUCT: 'Cadastro de produto',
  CUSTOMER: 'Cadastro de cliente',
  FISCAL: 'Documento fiscal',
  SETTINGS: 'Configurações',
};
type Value = { toString(): string };
export interface DashboardData {
  incoming: string;
  outgoing: string;
  stock: number;
  physicalStock?: number;
  reservedStock?: number;
  profit: string;
  recentSales: {
    id: string;
    productName: string;
    quantity: number;
    total: Value;
    sale: { createdAt: Date | string };
  }[];
  entries: {
    id: string;
    quantity: number;
    createdAt: Date | string;
    product: { name: string };
  }[];
  history: {
    id: string;
    createdAt: Date | string;
    type: string;
    description: string;
    quantity: number | null;
    amount: Value | null;
  }[];
}
export function DashboardView({
  data,
  month,
  type,
  owner,
}: {
  data: DashboardData;
  month: string;
  type?: string;
  owner: string;
}) {
  const cards = [
    {
      title: 'Entradas',
      tone: 'incoming',
      value: brl(data.incoming),
      note: 'Recebimentos no período',
      Icon: ArrowDownLeft,
    },
    {
      title: 'Saídas',
      tone: 'outgoing',
      value: brl(data.outgoing),
      note: 'Pagamentos no período',
      Icon: ArrowUpRight,
    },
    {
      title: 'Estoque atual',
      tone: 'stock',
      value: `${data.stock} itens`,
      note:
        data.physicalStock === undefined
          ? 'Saldo disponível agora'
          : `${data.physicalStock} físicos · ${data.reservedStock} reservados`,
      Icon: Package,
    },
    {
      title: 'Lucro presumido',
      tone: 'profit',
      value: brl(data.profit),
      note: 'Estimativa gerencial do período',
      Icon: Coins,
    },
  ];
  return (
    <>
      <PageTitle
        title={`Olá, ${owner.split(' ')[0]}!`}
        description="Um olhar simples sobre a sua revenda."
      >
        <Link className="button" href="/pedidos/novo">
          <Plus size={17} />
          Novo pedido
        </Link>
      </PageTitle>
      <div className="period-bar">
        <span>Seu resumo, sem complicação</span>
        <form>
          <label>
            Período{' '}
            <input
              aria-label="Mês de consulta"
              type="month"
              name="month"
              defaultValue={month}
            />
          </label>
          <button className="small-button">Aplicar</button>
        </form>
      </div>
      <div className="metrics">
        {cards.map(({ title, value, note, Icon, tone }) => (
          <Card
            className={`metric metric--${tone}${tone === 'profit' && D(data.profit).lt(0) ? ' metric--negative' : ''}`}
            key={title}
          >
            <div className="metric-heading">
              <span>{title}</span>
              <span className="metric-icon">
                <Icon size={22} strokeWidth={1.6} />
              </span>
            </div>
            <strong className="metric-value">{value}</strong>
            <small>{note}</small>
          </Card>
        ))}
      </div>
      <div className="dashboard-lists">
        <Card>
          <div className="section-heading">
            <h2>
              <ShoppingCart size={20} />
              Últimos itens vendidos
            </h2>
            <Link href="/vendas" aria-label="Ver todas as vendas">
              <ArrowRight size={18} />
            </Link>
          </div>
          {data.recentSales.length ? (
            <Table headers={['Produto', 'Qtd.', 'Valor bruto']}>
              {data.recentSales.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.productName}</strong>
                    <small>{dateTime(item.sale.createdAt)}</small>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{brl(item.total.toString())}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>
              Suas últimas vendas vão aparecer aqui.
              <Link href="/vendas">
                Registrar a primeira venda <ArrowRight size={15} />
              </Link>
            </Empty>
          )}
          <Link className="card-link" href="/vendas">
            Ver todas as vendas <ArrowRight size={16} />
          </Link>
        </Card>
        <Card>
          <div className="section-heading">
            <h2>
              <Package size={20} />
              Últimas entradas no estoque
            </h2>
            <Link href="/compras" aria-label="Ver todas as compras">
              <ArrowRight size={18} />
            </Link>
          </div>
          {data.entries.length ? (
            <Table headers={['Produto', 'Qtd.', 'Entrada']}>
              {data.entries.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.product.name}</strong>
                  </td>
                  <td>
                    <Badge>+{item.quantity}</Badge>
                  </td>
                  <td>{dateTime(item.createdAt)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>
              O estoque começa com uma entrada.
              <Link href="/compras">
                Registrar uma compra <ArrowRight size={15} />
              </Link>
            </Empty>
          )}
          <Link className="card-link" href="/compras">
            Ver todas as entradas <ArrowRight size={16} />
          </Link>
        </Card>
      </div>
      <Card>
        <div className="section-heading">
          <h2>
            <History size={20} />
            Histórico de movimentações
          </h2>
          <form className="inline-form">
            <input type="hidden" name="month" value={month} />
            <select
              aria-label="Tipo de movimentação"
              name="type"
              defaultValue={type || ''}
            >
              <option value="">Todas as movimentações</option>
              {Object.entries(types).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="small-button">Filtrar</button>
          </form>
        </div>
        {data.history.length ? (
          <Table
            headers={[
              'Data e hora',
              'Movimentação',
              'Descrição',
              'Quantidade',
              'Valor',
            ]}
          >
            {data.history.map((item) => (
              <tr key={item.id}>
                <td>{dateTime(item.createdAt)}</td>
                <td>
                  <Badge>{types[item.type] || item.type}</Badge>
                </td>
                <td>{item.description}</td>
                <td>{item.quantity ?? '—'}</td>
                <td>{item.amount ? brl(item.amount.toString()) : '—'}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>
            Nenhuma movimentação neste período. Seus registros aparecerão aqui
            automaticamente.
          </Empty>
        )}
        <p className="table-note">
          Até 50 registros mais recentes do período. Lucro presumido é uma
          estimativa comercial, sem valor contábil ou fiscal.
        </p>
      </Card>
    </>
  );
}

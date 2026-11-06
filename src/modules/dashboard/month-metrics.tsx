import { D, brl } from '@/lib/money';
import { Card } from '@/components/ui';

export interface MonthMetricsData {
  revenue: string;
  profit: string;
  incoming: string;
  outgoing: string;
  stock: number;
  physicalStock?: number;
  reservedStock?: number;
}

/** Números do mês: usados no Resumo e na tela Hoje do computador. */
export function MonthMetrics({ data }: { data: MonthMetricsData }) {
  const negative = D(data.profit).lt(0);
  const cards = [
    {
      title: 'Faturamento',
      tone: 'revenue',
      value: brl(data.revenue),
      note: 'Vendas concluídas no mês',
    },
    {
      title: 'Lucro líquido',
      tone: negative ? 'profit metric--negative' : 'profit',
      value: brl(data.profit),
      note: 'Após custo dos produtos e despesas das vendas',
    },
    {
      title: 'Recebido',
      tone: 'incoming',
      value: brl(data.incoming),
      note: 'Dinheiro que entrou no mês',
    },
    {
      title: 'Pago',
      tone: 'outgoing',
      value: brl(data.outgoing),
      note: 'Dinheiro que saiu no mês',
    },
    {
      title: 'Estoque atual',
      tone: 'stock',
      value: `${data.stock} itens`,
      note:
        data.physicalStock === undefined
          ? 'Disponíveis agora'
          : `${data.physicalStock} físicos · ${data.reservedStock} reservados`,
    },
  ];
  return (
    <div className="metrics">
      {cards.map(({ title, value, note, tone }) => (
        <Card className={`metric metric--${tone}`} key={title}>
          <div className="metric-heading">
            <span>{title}</span>
          </div>
          <strong className="metric-value">{value}</strong>
          <small>{note}</small>
        </Card>
      ))}
    </div>
  );
}

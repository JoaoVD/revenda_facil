import Link from 'next/link';
import { currentMonth } from '@/lib/money';
import { Card } from '@/components/ui';
export async function ReportsView() {
  return (
    <Card>
      <h2>Relatórios</h2>
      <p>
        O resumo do negócio e o histórico já estão em Resumo. Use o filtro de
        mês para consultar outro período.
      </p>
      <Link className="button" href={`/dashboard?month=${currentMonth()}`}>
        Consultar resumo do mês
      </Link>
    </Card>
  );
}

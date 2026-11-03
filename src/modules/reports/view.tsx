import Link from 'next/link';
import { currentMonth } from '@/lib/money';
import { Card } from '@/components/ui';
export async function ReportsView() {
  return (
    <Card>
      <h2>Relatórios avançados em desenvolvimento</h2>
      <p>
        O resumo do negócio e o histórico já estão disponíveis no Dashboard. Use
        o filtro de mês para consultar outro período.
      </p>
      <Link className="button" href={`/dashboard?month=${currentMonth()}`}>
        Consultar resumo do mês
      </Link>
      <p className="table-note">
        Exportação e relatórios detalhados serão implementados em uma próxima
        etapa.
      </p>
    </Card>
  );
}

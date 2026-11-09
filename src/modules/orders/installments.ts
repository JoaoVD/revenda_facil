import { D } from '@/lib/money';

/** Soma meses a uma data AAAA-MM-DD, mantendo o dia ou usando o último dia do mês. */
export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split('-').map(Number);
  const index = m - 1 + months,
    year = y + Math.floor(index / 12),
    month = ((index % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * Divide o saldo em parcelas mensais com centavos exatos: a diferença
 * de arredondamento fica na primeira parcela. Sem primeira data, as
 * parcelas ficam sem vencimento.
 */
export function splitInstallments(
  balance: string,
  count: number,
  firstDue = '',
) {
  const total = D(balance);
  if (!Number.isInteger(count) || count < 1 || total.lte(0)) return [];
  const base = total.div(count).toDecimalPlaces(2, 1 /* ROUND_DOWN */);
  const first = total.minus(base.mul(count - 1));
  return Array.from({ length: count }, (_, i) => ({
    amount: (i === 0 ? first : base).toFixed(2),
    dueDate: firstDue ? addMonths(firstDue, i) : '',
  }));
}

/** Data AAAA-MM-DD no fuso de São Paulo. */
export const isoToday = (date = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

/** Soma dias a uma data AAAA-MM-DD. */
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type Part = {
  dueDate: string | null;
  amount: { toString(): string };
  received: { toString(): string };
};

/** Próxima parcela não quitada com data e quantos dias de atraso ela tem. */
export function nextDue(installments: Part[], today: string) {
  const open = installments
    .filter(
      (p) => p.dueDate && D(p.received.toString()).lt(p.amount.toString()),
    )
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
  if (!open) return null;
  const days = Math.round(
    (Date.parse(`${today}T12:00:00Z`) -
      Date.parse(`${open.dueDate}T12:00:00Z`)) /
      86_400_000,
  );
  return {
    date: open.dueDate!,
    lateDays: Math.max(0, days),
    amount: D(open.amount.toString()).minus(open.received.toString()),
  };
}

export const brDate = (date: string) => date.split('-').reverse().join('/');

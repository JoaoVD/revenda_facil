import Decimal from 'decimal.js';
Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
export const D = (value: Decimal.Value) => new Decimal(value);
export const money = (value: Decimal.Value) =>
  D(value).toDecimalPlaces(2).toFixed(2);
export const brl = (value: Decimal.Value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value),
  );
export const dateTime = (value: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error('Período inválido.');
  const [y, m] = month.split('-').map(Number);
  return {
    gte: new Date(`${month}-01T00:00:00-03:00`),
    lt: new Date(
      `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00-03:00`,
    ),
  };
}
export const currentMonth = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());

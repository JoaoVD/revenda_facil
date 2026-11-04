import { D } from '@/lib/money';
/** Saídas ligadas à venda são reembolsos; recebimentos originais nunca são apagados. */
export function netReceived(
  payments: { amount: { toString(): string }; direction?: string }[],
) {
  return payments.reduce(
    (sum, payment) =>
      payment.direction === 'OUT'
        ? sum.minus(payment.amount.toString())
        : sum.plus(payment.amount.toString()),
    D(0),
  );
}

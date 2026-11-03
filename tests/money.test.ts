import { describe, it, expect } from 'vitest';
import { D, money, monthRange } from '@/lib/money';
import { validCnpj } from '@/modules/organizations/validation';
import { saleInput, purchaseInput } from '@/modules/shared/contracts';
describe('Precisão e validação', () => {
  it('soma e arredonda dinheiro sem ponto flutuante', () => {
    expect(money(D('0.1').plus('0.2'))).toBe('0.30');
    expect(money('1.005')).toBe('1.01');
  });
  it('forma um período mensal no fuso de São Paulo, inclusive virada de ano', () => {
    const r = monthRange('2026-12');
    expect(r.gte.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(r.lt.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
  it('rejeita meses inválidos', () => {
    expect(() => monthRange('2026-13')).toThrow();
  });
  it('valida dígitos do CNPJ', () => {
    expect(validCnpj('11222333000181')).toBe(true);
    expect(validCnpj('11111111111111')).toBe(false);
    expect(validCnpj('11222333000180')).toBe(false);
  });
  it('rejeita valores negativos, frações de quantidade e entradas vazias', () => {
    expect(
      saleInput.safeParse({
        idempotencyKey: crypto.randomUUID(),
        discount: '-1',
        items: [],
      }).success,
    ).toBe(false);
    expect(
      purchaseInput.safeParse({
        idempotencyKey: crypto.randomUUID(),
        supplier: 'Fornecedor',
        date: '2026-11-01',
        items: [
          { productId: crypto.randomUUID(), quantity: 1.5, unitCost: '10' },
        ],
      }).success,
    ).toBe(false);
  });
});

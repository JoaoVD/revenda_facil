import { describe, it, expect } from 'vitest';
import { whatsappLink, firstName } from '@/lib/whatsapp';
import {
  addMonths,
  addDays,
  splitInstallments,
  nextDue,
} from '@/modules/orders/installments';

describe('WhatsApp', () => {
  it('normaliza telefone brasileiro com e sem DDI', () => {
    expect(whatsappLink('(11) 98765-4321')).toBe('https://wa.me/5511987654321');
    expect(whatsappLink('+55 11 98765-4321')).toBe(
      'https://wa.me/5511987654321',
    );
    expect(whatsappLink('1133334444')).toBe('https://wa.me/551133334444');
  });
  it('ignora números incompletos e codifica a mensagem', () => {
    expect(whatsappLink('12345')).toBeNull();
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink('11987654321', 'Olá & até')).toBe(
      'https://wa.me/5511987654321?text=Ol%C3%A1%20%26%20at%C3%A9',
    );
  });
  it('extrai o primeiro nome', () => {
    expect(firstName('  Ana Maria Souza ')).toBe('Ana');
    expect(firstName(undefined)).toBe('');
  });
});

describe('Parcelas', () => {
  it('divide com centavos exatos, sobra na primeira', () => {
    const parts = splitInstallments('100.00', 3, '2026-01-31');
    expect(parts.map((p) => p.amount)).toEqual(['33.34', '33.33', '33.33']);
    expect(parts.map((p) => p.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });
  it('sem primeira data deixa sem vencimento e recusa entradas inválidas', () => {
    expect(splitInstallments('10', 2)).toEqual([
      { amount: '5.00', dueDate: '' },
      { amount: '5.00', dueDate: '' },
    ]);
    expect(splitInstallments('0', 2)).toEqual([]);
    expect(splitInstallments('10', 0)).toEqual([]);
  });
  it('soma meses e dias atravessando o ano', () => {
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('encontra a próxima parcela em aberto e o atraso', () => {
    const due = nextDue(
      [
        { dueDate: '2026-11-01', amount: '50', received: '50' },
        { dueDate: '2026-11-05', amount: '50', received: '10' },
        { dueDate: null, amount: '20', received: '0' },
      ],
      '2026-11-09',
    );
    expect(due).toMatchObject({ date: '2026-11-05', lateDays: 4 });
    expect(due!.amount.toFixed(2)).toBe('40.00');
    expect(nextDue([], '2026-11-09')).toBeNull();
  });
});

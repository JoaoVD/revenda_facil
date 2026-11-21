import { describe, expect, it } from 'vitest';
import { describeNfeKey, extractNfeKey } from '@/modules/purchases/nfe-key';
import { validNfeKey } from '@/modules/purchases/invoice-contracts';

/** Monta uma chave válida (modelo 55) calculando o dígito verificador. */
function key(body43: string) {
  let sum = 0;
  for (let i = 42; i >= 0; i--) sum += Number(body43[i]) * (2 + ((42 - i) % 8));
  const digit = 11 - (sum % 11);
  return body43 + String(digit >= 10 ? 0 : digit);
}
// SP, 11/2026, CNPJ 12.345.678/0001-95, modelo 55, série 1, nº 4.567
const valid = key(
  '35' +
    '2611' +
    '12345678000195' +
    '55' +
    '001' +
    '000004567' +
    '1' +
    '12345678',
);

describe('extractNfeKey', () => {
  it('aceita a chave do código de barras, com ou sem espaços', () => {
    expect(validNfeKey(valid)).toBe(true);
    expect(extractNfeKey(valid)).toBe(valid);
    expect(extractNfeKey(valid.replace(/(\d{4})/g, '$1 '))).toBe(valid);
  });
  it('encontra a chave dentro da URL de um QR Code', () => {
    expect(
      extractNfeKey(
        `https://www.sefaz.sp.gov.br/consulta?chNFe=${valid}&tpAmb=1`,
      ),
    ).toBe(valid);
    expect(
      extractNfeKey(`https://nfe.exemplo/qrcode?p=${valid}|2|1|1|ABC`),
    ).toBe(valid);
  });
  it('recusa chave com dígito verificador errado ou incompleta', () => {
    const wrong = valid.slice(0, 43) + String((Number(valid[43]) + 1) % 10);
    expect(extractNfeKey(wrong)).toBeNull();
    expect(extractNfeKey(valid.slice(0, 40))).toBeNull();
    expect(extractNfeKey('')).toBeNull();
  });
});

describe('describeNfeKey', () => {
  it('lê fornecedor, número, série e emissão da própria chave', () => {
    expect(describeNfeKey(valid)).toEqual({
      state: 'SP',
      issued: '11/2026',
      supplierDocument: '12.345.678/0001-95',
      series: '1',
      number: '4.567',
    });
  });
});

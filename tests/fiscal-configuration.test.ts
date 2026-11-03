import { describe, expect, it } from 'vitest';
import {
  fiscalEmitterInput,
  fiscalProductInput,
  fiscalCustomerInput,
} from '../src/modules/fiscal/configuration';

const address = {
  xLgr: 'Rua das Flores',
  nro: '10',
  xBairro: 'Centro',
  cMun: '3550308',
  xMun: 'São Paulo',
  CEP: '01001000',
  UF: 'SP',
};
const emitter = {
  xNome: 'Empresa de teste',
  IE: '123456789012',
  ...address,
  confirmCRT4: 'on',
};
const tax = {
  ICMS: { ICMSSN102: { orig: 0, CSOSN: '102' } },
  PIS: { PISNT: { CST: '07' } },
  COFINS: { COFINSNT: { CST: '07' } },
};
const product = {
  productId: '11111111-1111-4111-8111-111111111111',
  NCM: '33049990',
  CFOP: '5102',
  uCom: 'UN',
  uTrib: 'UN',
  imposto: JSON.stringify(tax),
};

describe('cadastros fiscais estruturados', () => {
  it('requires explicit confirmation of CRT 4 and a São Paulo emitter', () => {
    expect(fiscalEmitterInput.safeParse(emitter).success).toBe(true);
    expect(
      fiscalEmitterInput.safeParse({ ...emitter, confirmCRT4: undefined })
        .success,
    ).toBe(false);
    expect(fiscalEmitterInput.safeParse({ ...emitter, UF: 'RJ' }).success).toBe(
      false,
    );
    expect(
      fiscalEmitterInput.safeParse({ ...emitter, cMun: '3304557' }).success,
    ).toBe(false);
  });
  it('rejects incomplete addresses and credential fields', () => {
    expect(fiscalEmitterInput.safeParse({ ...emitter, CEP: '' }).success).toBe(
      false,
    );
    expect(
      fiscalEmitterInput.safeParse({ ...emitter, client_secret: 'secret' })
        .success,
    ).toBe(false);
  });
  it('requires explicit taxes and equal commercial and taxable units', () => {
    expect(fiscalProductInput.parse(product).imposto).toEqual(tax);
    for (const patch of [
      { imposto: '' },
      { imposto: '{}' },
      { imposto: 'null' },
      { uTrib: 'CX' },
      { NCM: '123' },
      { CFOP: '9999' },
    ])
      expect(
        fiscalProductInput.safeParse({ ...product, ...patch }).success,
      ).toBe(false);
    expect(
      fiscalProductInput.safeParse({
        ...product,
        imposto: JSON.stringify({ ...tax, token: 'secret' }),
      }).success,
    ).toBe(false);
  });
  it('validates recipient identification and required IE', () => {
    const customer = {
      customerId: product.productId,
      document: '52998224725',
      xNome: 'Maria Silva',
      indIEDest: '9',
      IE: '',
      ...address,
    };
    expect(fiscalCustomerInput.safeParse(customer).success).toBe(true);
    expect(
      fiscalCustomerInput.safeParse({ ...customer, document: '11111111111' })
        .success,
    ).toBe(false);
    expect(
      fiscalCustomerInput.safeParse({ ...customer, indIEDest: '1' }).success,
    ).toBe(false);
    expect(
      fiscalCustomerInput.safeParse({
        ...customer,
        indIEDest: '1',
        IE: '123456789012',
      }).success,
    ).toBe(true);
  });
  it('requires origin and tax classification inside each explicit group', () => {
    for (const imposto of [
      { ...tax, ICMS: { ICMSSN102: { CSOSN: '102' } } },
      { ...tax, ICMS: { ICMSSN102: { orig: 0 } } },
      { ...tax, PIS: { PISNT: {} } },
      { ...tax, COFINS: { COFINSNT: {} } },
    ])
      expect(
        fiscalProductInput.safeParse({
          ...product,
          imposto: JSON.stringify(imposto),
        }).success,
      ).toBe(false);
  });
});

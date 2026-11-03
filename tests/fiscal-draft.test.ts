import { expect, it } from 'vitest';
import { configuredFiscalTemplate } from '@/modules/fiscal/template';
import { composeFiscalDraft, fiscalDraftIssues } from '@/modules/fiscal/draft';
import { validateFiscalPayload } from '@/modules/fiscal/payload';
import { toFocusPayload } from '@/modules/fiscal/focus-payload';
const sale = {
  id: 's',
  subtotal: '10.00',
  discount: '1.00',
  total: '9.00',
  items: [
    {
      productId: 'p',
      productName: 'Produto',
      quantity: 1,
      unitPrice: '10.00',
      total: '10.00',
    },
  ],
};
const address = {
  xLgr: 'Rua',
  nro: '1',
  xBairro: 'Centro',
  cMun: '3550308',
  xMun: 'São Paulo',
  UF: 'SP',
  CEP: '01001000',
};
const template = () =>
  configuredFiscalTemplate(sale, '11222333000181', '65', {
    emitter: { xNome: 'Empresa', IE: '123456789', CRT: 4, enderEmit: address },
    products: {
      p: {
        NCM: '33049990',
        CFOP: '5102',
        uCom: 'UN',
        uTrib: 'UN',
        imposto: {
          ICMS: { ICMSSN102: { orig: 0, CSOSN: '102' } },
          PIS: { PISNT: { CST: '07' } },
          COFINS: { COFINSNT: { CST: '07' } },
        },
      },
    },
  });
const fields = {
  serie: '1',
  nNF: '1',
  dhEmi: '2026-11-02T12:00:00-03:00',
  natOp: 'Venda de mercadoria',
  idDest: '1',
  indPres: '1',
  indFinal: '1',
  tPag: '17',
  indPag: '1',
};
it('prepares a validated snapshot from saved profiles and explicit fields with the full sale amount', () => {
  const raw = composeFiscalDraft(template(), fields);
  const canonical = validateFiscalPayload(raw, sale, '11222333000181', '65');
  expect(toFocusPayload(canonical, '65')).toMatchObject({
    numero: 1,
    serie: 1,
    valor_total: 9,
    formas_pagamento: [
      { forma_pagamento: '17', valor_pagamento: 9, indicador_pagamento: 1 },
    ],
  });
  expect(raw.infNFe.pag.detPag).toEqual([
    { tPag: '17', indPag: 1, vPag: '9.00' },
  ]);
  expect(raw.infNFe.total.ICMSTot.vICMS).toBe('0.00');
});
it('reports missing classification, emitter and unsupported charged taxes', () => {
  const raw = template();
  const info = raw.infNFe as Record<string, unknown>;
  info.emit = {};
  const details = info.det as Array<{
    prod: Record<string, unknown>;
    imposto: unknown;
  }>;
  details[0].prod.NCM = '';
  details[0].imposto = { ICMS: { ICMS00: { orig: 0, CST: '00', vICMS: 1 } } };
  const issues = fiscalDraftIssues(raw);
  expect(issues.join(' ')).toMatch(/emitente/i);
  expect(issues.join(' ')).toMatch(/NCM/);
  expect(issues.join(' ')).toMatch(/tributação/i);
  expect(() => composeFiscalDraft(raw, fields)).toThrow();
});
it('does not silently drop tax extensions or permit card payments without integration details', () => {
  const raw = template();
  const info = raw.infNFe as {
    det: Array<{ imposto: Record<string, unknown> }>;
  };
  info.det[0].imposto.IPI = { IPITrib: { vIPI: 1 } };
  expect(fiscalDraftIssues(raw).join(' ')).toMatch(/tributação/i);
  expect(() =>
    composeFiscalDraft(template(), { ...fields, tPag: '03' }),
  ).toThrow(/cartão/i);
});
it('blocks an interstate recipient and unsupported NFC-e operation fields', () => {
  const raw = template();
  const info = raw.infNFe as Record<string, unknown>;
  info.dest = {
    CPF: '12345678909',
    xNome: 'Cliente',
    indIEDest: 9,
    enderDest: { ...address, UF: 'RJ' },
  };
  expect(fiscalDraftIssues(raw).join(' ')).toMatch(/mesmo estado/i);
  expect(() =>
    composeFiscalDraft(template(), { ...fields, indFinal: '0' }),
  ).toThrow(/consumidor final/i);
});

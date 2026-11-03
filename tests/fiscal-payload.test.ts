import { describe, expect, it } from 'vitest';
import {
  allocateDiscount,
  buildFiscalTemplate,
  validateFiscalPayload,
} from '@/modules/fiscal/payload';

const cnpj = '11222333000181';
const sale = {
  id: 'sale-1',
  subtotal: '30.00',
  discount: '1.00',
  total: '29.00',
  items: [
    {
      productId: 'p1',
      productName: 'Produto',
      quantity: 2,
      unitPrice: '10.00',
      total: '20.00',
    },
    {
      productId: 'p2',
      productName: 'Outro',
      quantity: 1,
      unitPrice: '10.00',
      total: '10.00',
    },
  ],
};
const address = {
  xLgr: 'Rua Teste',
  nro: '10',
  xBairro: 'Centro',
  cMun: '3550308',
  xMun: 'São Paulo',
  UF: 'SP',
  CEP: '01001000',
};
function payload(model: '55' | '65' = '65') {
  return {
    ambiente: 'homologacao',
    infNFe: {
      versao: '4.00',
      ide: {
        cUF: 35,
        natOp: 'Venda',
        mod: Number(model),
        serie: 1,
        nNF: 1,
        dhEmi: '2026-11-02T10:00:00-03:00',
        tpNF: 1,
        idDest: 1,
        cMunFG: '3550308',
        tpImp: model === '65' ? 4 : 1,
        tpEmis: 1,
        tpAmb: 2,
        finNFe: 1,
        indFinal: 1,
        indPres: 1,
        procEmi: 0,
        verProc: '1.0',
      },
      emit: {
        CNPJ: cnpj,
        xNome: 'Empresa',
        IE: '123456789',
        CRT: 4,
        enderEmit: { ...address },
      },
      ...(model === '55'
        ? {
            dest: {
              CNPJ: cnpj,
              xNome: 'Cliente',
              indIEDest: 9,
              enderDest: { ...address },
            },
          }
        : {}),
      det: sale.items.map((item, index) => ({
        nItem: index + 1,
        prod: {
          cProd: item.productId,
          xProd: item.productName,
          NCM: '33049990',
          CFOP: '5102',
          uCom: 'UN',
          qCom: item.quantity,
          vUnCom: item.unitPrice,
          vProd: item.total,
          vDesc: index === 0 ? '0.67' : '0.33',
          uTrib: 'UN',
          qTrib: item.quantity,
          vUnTrib: item.unitPrice,
          indTot: 1,
        },
        imposto: {
          ICMS: { ICMSSN102: { orig: 0, CSOSN: '102' } },
          PIS: { PISNT: { CST: '07' } },
          COFINS: { COFINSNT: { CST: '07' } },
        },
      })),
      total: {
        ICMSTot: {
          vBC: '0',
          vICMS: '0',
          vICMSDeson: '0',
          vFCP: '0',
          vBCST: '0',
          vST: '0',
          vFCPST: '0',
          vFCPSTRet: '0',
          vProd: '30',
          vFrete: '0',
          vSeg: '0',
          vDesc: '1',
          vII: '0',
          vIPI: '0',
          vIPIDevol: '0',
          vPIS: '0',
          vCOFINS: '0',
          vOutro: '0',
          vNF: '29',
        },
      },
      transp: { modFrete: 9 },
      pag: { detPag: [{ tPag: '01', vPag: '29' }] },
    },
  };
}

describe('fiscal payload', () => {
  it('allocates exact cents deterministically using largest remainders', () => {
    expect(allocateDiscount(['20', '10'], '1')).toEqual(['0.67', '0.33']);
    expect(allocateDiscount(['1', '1', '1'], '0.02')).toEqual([
      '0.01',
      '0.01',
      '0.00',
    ]);
    expect(allocateDiscount(['0', '0'], '0')).toEqual(['0.00', '0.00']);
    expect(() => allocateDiscount(['1'], '1.01')).toThrow();
    expect(() => allocateDiscount(['1.001'], '0')).toThrow();
  });
  it.each(['55', '65'] as const)(
    'accepts explicit accountant payload for model %s and preserves fiscal extensions',
    (model) => {
      const raw = { ...payload(model), customMetadata: { reviewed: true } };
      const result = validateFiscalPayload(raw, sale, cnpj, model);
      expect(result.customMetadata).toEqual({ reviewed: true });
      const info = result.infNFe as ReturnType<typeof payload>['infNFe'];
      expect(info.det[0].prod.vProd).toBe(20);
      expect(info.total.ICMSTot.vNF).toBe(29);
    },
  );
  it('builds an incomplete template with sale amounts, never fictitious fiscal classification', () => {
    const raw = buildFiscalTemplate(sale, cnpj, '65');
    const info = raw.infNFe as ReturnType<typeof payload>['infNFe'];
    expect(info.det[0].prod).toMatchObject({
      cProd: 'p1',
      vProd: '20.00',
      vDesc: '0.67',
      NCM: '',
      CFOP: '',
    });
    expect(() => validateFiscalPayload(raw, sale, cnpj, '65')).toThrow();
  });
  it.each([
    'ambiente',
    'emitter',
    'model',
    'number',
    'date',
    'tax',
    'classification',
    'item',
    'discount',
    'total',
    'payment',
    'missingAmount',
    'credentials',
    'oversized',
  ] as const)('rejects invalid %s', (invalid) => {
    const raw = payload();
    switch (invalid) {
      case 'ambiente':
        raw.ambiente = 'producao';
        break;
      case 'emitter':
        raw.infNFe.emit.CNPJ = '12345678000195';
        break;
      case 'model':
        raw.infNFe.ide.mod = 55;
        break;
      case 'number':
        raw.infNFe.ide.nNF = 0;
        break;
      case 'date':
        raw.infNFe.ide.dhEmi = 'invalid';
        break;
      case 'tax':
        raw.infNFe.det[0].imposto.ICMS =
          {} as (typeof raw.infNFe.det)[0]['imposto']['ICMS'];
        break;
      case 'classification':
        raw.infNFe.det[0].prod.NCM = '';
        break;
      case 'item':
        raw.infNFe.det[0].prod.cProd = 'unrelated';
        break;
      case 'discount':
        raw.infNFe.det[0].prod.vDesc = '0.66';
        break;
      case 'total':
        raw.infNFe.total.ICMSTot.vNF = '30';
        break;
      case 'payment':
        raw.infNFe.pag.detPag[0].vPag = '28';
        break;
      case 'missingAmount':
        Reflect.deleteProperty(raw.infNFe.det[0].prod, 'vProd');
        break;
      case 'credentials':
        Object.assign(raw, { nested: { client_secret: 'sensitive' } });
        break;
      case 'oversized':
        Object.assign(raw, { comments: 'x'.repeat(512_001) });
        break;
    }
    expect(() => validateFiscalPayload(raw, sale, cnpj, '65')).toThrow();
  });
  it('requires recipient and full address for NF-e', () => {
    const raw = payload('55');
    Reflect.deleteProperty(raw.infNFe, 'dest');
    expect(() => validateFiscalPayload(raw, sale, cnpj, '55')).toThrow();
    const incomplete = payload('55');
    Reflect.deleteProperty(incomplete.infNFe.dest!.enderDest, 'cMun');
    expect(() => validateFiscalPayload(incomplete, sale, cnpj, '55')).toThrow();
  });
  it('requires monetary tax fields for taxed groups and rejects invented tax groups', () => {
    const raw = payload();
    Object.assign(raw.infNFe.det[0].imposto, {
      ICMS: { ICMS00: { orig: 0, CST: '00' } },
    });
    expect(() => validateFiscalPayload(raw, sale, cnpj, '65')).toThrow();
    Object.assign(raw.infNFe.det[0].imposto, {
      ICMS: { Invented: { orig: 0, CST: '00' } },
    });
    expect(() => validateFiscalPayload(raw, sale, cnpj, '65')).toThrow();
  });
  it('checks persisted sale math and product quantities rather than trusting supplied totals', () => {
    expect(() =>
      validateFiscalPayload(payload(), { ...sale, total: '28' }, cnpj, '65'),
    ).toThrow();
    const raw = payload();
    raw.infNFe.det[0].prod.qCom = 1;
    expect(() => validateFiscalPayload(raw, sale, cnpj, '65')).toThrow();
  });
  it('accepts explicit change when payment minus change equals sale total', () => {
    const raw = payload();
    raw.infNFe.pag.detPag[0].vPag = '30';
    Object.assign(raw.infNFe.pag, { vTroco: '1' });
    expect(validateFiscalPayload(raw, sale, cnpj, '65')).toBeTruthy();
  });
  it('requires monetary fields in explicitly taxed PIS and COFINS', () => {
    const raw = payload();
    Object.assign(raw.infNFe.det[0].imposto, {
      PIS: { PISAliq: { CST: '01' } },
    });
    expect(() => validateFiscalPayload(raw, sale, cnpj, '65')).toThrow();
  });
});

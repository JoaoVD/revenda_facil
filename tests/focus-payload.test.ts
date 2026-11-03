import { describe, expect, it } from 'vitest';
import { toFocusPayload } from '../src/modules/fiscal/focus-payload';
import { composeFiscalDraft } from '../src/modules/fiscal/draft';
import {
  buildFiscalTemplate,
  validateFiscalPayload,
} from '../src/modules/fiscal/payload';

const cnpj = '11222333000181';
type Data = Record<string, unknown>;
type Info = Data & {
  ide: Data;
  emit: Data & { enderEmit: Data };
  dest: Data & { enderDest: Data };
  det: Array<
    Data & {
      prod: Data;
      imposto: {
        ICMS: Record<string, Data>;
        PIS: Record<string, Data>;
        COFINS: Record<string, Data>;
      };
    }
  >;
  total: { ICMSTot: Data };
  transp: Data;
  pag: Data & { detPag: Array<Data>; vTroco?: number };
};
const sale = {
  id: 's1',
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
function fixture(model: '55' | '65' = '65') {
  // The converter consumes the existing canonical, sale-validated envelope.
  const raw = buildFiscalTemplate(sale, cnpj, model);
  const info = raw.infNFe as Info;
  const address = {
    xLgr: 'Rua Teste',
    nro: '10',
    xBairro: 'Centro',
    cMun: '3550308',
    xMun: 'São Paulo',
    UF: 'SP',
    CEP: '01001000',
  };
  Object.assign(info.ide, {
    cUF: 35,
    natOp: 'Venda',
    serie: 1,
    nNF: 123,
    dhEmi: '2026-11-02T10:00:00-03:00',
    tpNF: 1,
    idDest: 1,
    cMunFG: '3550308',
    tpImp: model === '65' ? 4 : 1,
    tpEmis: 1,
    finNFe: 1,
    indFinal: 1,
    indPres: 1,
    procEmi: 0,
    verProc: '1.0',
  });
  Object.assign(info.emit, {
    xNome: 'Empresa',
    IE: '123456789',
    CRT: 4,
    enderEmit: { ...address },
  });
  if (model === '55')
    info.dest = {
      CNPJ: cnpj,
      xNome: 'Cliente',
      indIEDest: 9,
      enderDest: { ...address },
    };
  for (const detail of info.det) {
    Object.assign(detail.prod, {
      NCM: '33049990',
      CFOP: '5102',
      uCom: 'UN',
      uTrib: 'UN',
      qTrib: detail.prod.qCom,
      vUnTrib: detail.prod.vUnCom,
    });
    detail.imposto = {
      ICMS: { ICMSSN102: { orig: 0, CSOSN: '102' } },
      PIS: { PISNT: { CST: '07' } },
      COFINS: { COFINSNT: { CST: '07' } },
    };
  }
  for (const key of Object.keys(info.total.ICMSTot))
    if (info.total.ICMSTot[key] === '') info.total.ICMSTot[key] = '0';
  info.transp.modFrete = 9;
  info.pag.detPag[0].tPag = '01';
  return validateFiscalPayload(raw, sale, cnpj, model);
}

describe('Focus canonical conversion', () => {
  it.each(['55', '65'] as const)(
    'accepts the guided composer for model %s, including explicit nonintegrated card',
    (model) => {
      const draft = composeFiscalDraft(fixture(model), {
        serie: '1',
        nNF: '123',
        dhEmi: '2026-11-02T10:00:00-03:00',
        natOp: 'Venda',
        idDest: '1',
        indPres: '1',
        indFinal: '1',
        tPag: '03',
        indPag: '0',
        tpIntegra: '2',
      });
      const validated = validateFiscalPayload(draft, sale, cnpj, model);
      expect(toFocusPayload(validated, model)).toMatchObject({
        numero: 123,
        formas_pagamento: [
          {
            forma_pagamento: '03',
            indicador_pagamento: 0,
            tipo_integracao: 2,
            valor_pagamento: 29,
          },
        ],
      });
    },
  );
  it.each(['55', '65'] as const)(
    'translates model %s using named API fields and preserves exact validated amounts',
    (model) => {
      const raw = fixture(model),
        before = structuredClone(raw);
      const result = toFocusPayload(raw, model);
      expect(result).toMatchObject({
        ambiente: 'homologacao',
        natureza_operacao: 'Venda',
        serie: 1,
        numero: 123,
        data_emissao: '2026-11-02T10:00:00-03:00',
        regime_tributario_emitente: 4,
        cnpj_emitente: cnpj,
        codigo_municipio_emitente: '3550308',
        modalidade_frete: 9,
        valor_produtos: 30,
        valor_desconto: 1,
        valor_total: 29,
        formas_pagamento: [{ forma_pagamento: '01', valor_pagamento: 29 }],
      });
      expect(result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            numero_item: 1,
            codigo_produto: 'p1',
            quantidade_comercial: 2,
            valor_bruto: 20,
            valor_desconto: 0.67,
            icms_origem: 0,
            icms_situacao_tributaria: '102',
            pis_situacao_tributaria: '07',
            cofins_situacao_tributaria: '07',
          }),
          expect.objectContaining({ numero_item: 2, valor_desconto: 0.33 }),
        ]),
      );
      if (model === '55') expect(result.nome_destinatario).toBe('Cliente');
      expect(result).not.toHaveProperty('infNFe');
      expect(raw).toEqual(before);
    },
  );
  it.each(['102', '103', '300', '400'])(
    'supports explicit non-taxed simple national status %s',
    (code) => {
      const raw = fixture();
      const info = raw.infNFe as Info;
      info.det[0].imposto.ICMS.ICMSSN102.CSOSN = code;
      expect(
        (toFocusPayload(raw, '65').items as Record<string, unknown>[])[0]
          .icms_situacao_tributaria,
      ).toBe(code);
    },
  );
  it('maps explicit optional product, recipient, additional information and card fields', () => {
    const raw = fixture('55'),
      info = raw.infNFe as Info;
    info.dest.IE = '123456789';
    info.det[0].prod.cEAN = 'SEM GTIN';
    info.det[0].prod.cEANTrib = 'SEM GTIN';
    info.det[0].prod.CEST = '1234567';
    info.det[0].prod.cBenef = 'SP123456';
    info.infAdic = { infCpl: 'Informação revisada' };
    info.pag.detPag = [
      {
        tPag: '03',
        vPag: 30,
        card: { tpIntegra: 2, CNPJ: cnpj, tBand: '01', cAut: '123' },
      },
    ];
    info.pag.vTroco = 1;
    expect(toFocusPayload(raw, '55')).toMatchObject({
      inscricao_estadual_destinatario: '123456789',
      informacoes_adicionais_contribuinte: 'Informação revisada',
      valor_troco: 1,
      formas_pagamento: [
        {
          forma_pagamento: '03',
          valor_pagamento: 30,
          tipo_integracao: 2,
          cnpj_credenciadora: cnpj,
          bandeira_operadora: '01',
          numero_autorizacao: '123',
        },
      ],
    });
  });
  it.each([
    'envelope',
    'info',
    'ide',
    'emit',
    'address',
    'detail',
    'prod',
    'imposto',
    'icms',
    'pis',
    'total',
    'totals',
    'transp',
    'pag',
    'payment',
  ])('fails closed on unmapped extension at %s', (location) => {
    const raw = fixture(),
      info = raw.infNFe as Info;
    const sections: Record<string, Record<string, unknown>> = {
      envelope: raw,
      info,
      ide: info.ide,
      emit: info.emit,
      address: info.emit.enderEmit,
      detail: info.det[0],
      prod: info.det[0].prod,
      imposto: info.det[0].imposto,
      icms: info.det[0].imposto.ICMS.ICMSSN102,
      pis: info.det[0].imposto.PIS.PISNT,
      total: info.total,
      totals: info.total.ICMSTot,
      transp: info.transp,
      pag: info.pag,
      payment: info.pag.detPag[0],
    };
    sections[location].unmappedFiscalData = 1;
    expect(() => toFocusPayload(raw, '65')).toThrow(/não suportado/i);
  });
  it.each([
    'tax',
    'contribution',
    'taxTotal',
    'environment',
    'model',
    'foreign',
  ])('blocks unsupported or inconsistent %s', (kind) => {
    const raw = fixture(),
      info = raw.infNFe as Info;
    if (kind === 'tax')
      info.det[0].imposto.ICMS = { ICMSSN900: { orig: 0, CSOSN: '900' } };
    if (kind === 'contribution')
      info.det[0].imposto.PIS = {
        PISAliq: { CST: '01', vBC: 20, pPIS: 1, vPIS: 0.2 },
      };
    if (kind === 'taxTotal') info.total.ICMSTot.vPIS = 1;
    if (kind === 'environment') raw.ambiente = 'producao';
    if (kind === 'model') info.ide.mod = 55;
    if (kind === 'foreign') info.ide.idDest = 3;
    expect(() => toFocusPayload(raw, '65')).toThrow();
  });
});

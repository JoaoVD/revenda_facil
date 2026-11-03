import Decimal from 'decimal.js';
import { z } from 'zod';
import { validCnpj } from '@/modules/organizations/validation';

export type FiscalSale = {
  id: string;
  total: string;
  discount: string;
  subtotal: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
};
const text = z.string().trim().min(1).max(200);
const digits = (length: number) =>
  z.string().regex(new RegExp(`^\\d{${length}}$`));
const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
const decimal = (places: number) =>
  z
    .union([
      z.string().regex(/^\d+(\.\d+)?$/),
      z.number().finite().nonnegative(),
    ])
    .refine(
      (value) =>
        new Decimal(value).decimalPlaces() <= places &&
        new Decimal(value).lte('9999999999999.99'),
      'Valor decimal inválido.',
    );
const amount = decimal(2);
const address = z
  .object({
    xLgr: text,
    nro: text,
    xBairro: text,
    cMun: digits(7),
    xMun: text,
    UF: z
      .string()
      .regex(
        /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
      ),
    CEP: digits(8),
  })
  .passthrough();
const recipient = z
  .object({
    CNPJ: digits(14).refine(validCnpj).optional(),
    CPF: digits(11).optional(),
    idEstrangeiro: text.optional(),
    xNome: text,
    indIEDest: z.union([z.literal(1), z.literal(2), z.literal(9)]),
    enderDest: address,
  })
  .passthrough()
  .refine(
    (value) =>
      [value.CNPJ, value.CPF, value.idEstrangeiro].filter(Boolean).length === 1,
    'Identificação do destinatário obrigatória.',
  );
const taxGroup = z
  .record(z.string(), z.object({}).passthrough())
  .refine(
    (value) => Object.keys(value).length === 1,
    'Informe um grupo tributário explícito.',
  );
const icms = taxGroup.refine(
  (value) =>
    Object.values(value).every((group) => {
      const origin = group.orig;
      return (
        typeof origin === 'number' &&
        Number.isInteger(origin) &&
        origin >= 0 &&
        origin <= 8 &&
        ((typeof group.CST === 'string' && /^\d{2}$/.test(group.CST)) ||
          (typeof group.CSOSN === 'string' && /^\d{3}$/.test(group.CSOSN)))
      );
    }),
  'Origem e CST/CSOSN devem ser informados pelo responsável fiscal.',
);
const contribution = taxGroup.refine(
  (value) =>
    Object.values(value).every(
      (group) => typeof group.CST === 'string' && /^\d{2}$/.test(group.CST),
    ),
  'CST obrigatório.',
);
const totalFields = [
  'vBC',
  'vICMS',
  'vICMSDeson',
  'vFCP',
  'vBCST',
  'vST',
  'vFCPST',
  'vFCPSTRet',
  'vProd',
  'vFrete',
  'vSeg',
  'vDesc',
  'vII',
  'vIPI',
  'vIPIDevol',
  'vPIS',
  'vCOFINS',
  'vOutro',
  'vNF',
] as const;
const totals = z
  .object(
    Object.fromEntries(totalFields.map((key) => [key, amount])) as Record<
      (typeof totalFields)[number],
      typeof amount
    >,
  )
  .passthrough();
const envelope = z
  .object({
    ambiente: z.literal('homologacao'),
    referencia: z.string().max(50).optional(),
    infNFe: z
      .object({
        versao: z.literal('4.00'),
        ide: z
          .object({
            cUF: integer(11, 53),
            natOp: text,
            mod: z.union([z.literal(55), z.literal(65)]),
            serie: integer(1, 999),
            nNF: integer(1, 999999999),
            dhEmi: z.iso.datetime({ offset: true }),
            tpNF: z.literal(1),
            idDest: integer(1, 3),
            cMunFG: digits(7),
            tpImp: integer(1, 5),
            tpEmis: z.literal(1),
            tpAmb: z.literal(2),
            finNFe: z.literal(1),
            indFinal: integer(0, 1),
            indPres: integer(0, 9),
            procEmi: integer(0, 3),
            verProc: text,
          })
          .passthrough(),
        emit: z
          .object({
            CNPJ: digits(14).refine(validCnpj),
            xNome: text,
            IE: z.string().regex(/^\d{2,14}$/),
            CRT: z.literal(4),
            enderEmit: address,
          })
          .passthrough(),
        dest: recipient.optional(),
        det: z
          .array(
            z
              .object({
                nItem: integer(1, 990),
                prod: z
                  .object({
                    cProd: text,
                    xProd: text,
                    NCM: digits(8),
                    CFOP: z.string().regex(/^[12567]\d{3}$/),
                    uCom: text,
                    qCom: decimal(4),
                    vUnCom: decimal(10),
                    vProd: amount,
                    vDesc: amount,
                    uTrib: text,
                    qTrib: decimal(4),
                    vUnTrib: decimal(10),
                    indTot: z.literal(1),
                  })
                  .passthrough(),
                imposto: z
                  .object({
                    ICMS: icms,
                    PIS: contribution,
                    COFINS: contribution,
                  })
                  .passthrough(),
              })
              .passthrough(),
          )
          .min(1)
          .max(990),
        total: z.object({ ICMSTot: totals }).passthrough(),
        transp: z
          .object({
            modFrete: z.union([
              z.literal(0),
              z.literal(1),
              z.literal(2),
              z.literal(3),
              z.literal(4),
              z.literal(9),
            ]),
          })
          .passthrough(),
        pag: z
          .object({
            detPag: z
              .array(z.object({ tPag: digits(2), vPag: amount }).passthrough())
              .min(1)
              .max(100),
            vTroco: amount.optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function money(value: string): Decimal {
  amount.parse(value);
  return new Decimal(value);
}
const sum = (values: Decimal.Value[]) =>
  values.reduce<Decimal>((total, value) => total.plus(value), new Decimal(0));

/** Largest-remainder allocation; input order resolves equal fractional remainders. */
export function allocateDiscount(lines: string[], discount: string): string[] {
  const values = lines.map(money),
    total = sum(values),
    reduction = money(discount);
  check(reduction.lte(total), 'Desconto maior que o subtotal.');
  if (total.isZero()) return lines.map(() => '0.00');
  const cents = reduction.times(100);
  const shares = values.map((value, index) => {
    const exact = value.times(cents).div(total);
    return {
      index,
      cents: exact.floor(),
      remainder: exact.minus(exact.floor()),
    };
  });
  const remaining = cents
    .minus(sum(shares.map((share) => share.cents)))
    .toNumber();
  const ordered = [...shares].sort(
    (a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index,
  );
  for (let i = 0; i < remaining; i++)
    ordered[i].cents = ordered[i].cents.plus(1);
  return shares.map((share) => share.cents.div(100).toFixed(2));
}

/** JSON-only snapshot guard also prevents credentials from entering persisted payloads. */
function inspectJson(value: unknown, depth = 0): void {
  check(depth <= 40, 'Payload fiscal muito profundo.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return;
  if (typeof value === 'number') {
    check(Number.isFinite(value), 'Número inválido.');
    return;
  }
  check(
    typeof value === 'object' && value !== null,
    'Informe somente dados JSON.',
  );
  if (Array.isArray(value)) {
    value.forEach((child) => inspectJson(child, depth + 1));
    return;
  }
  check(
    Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null,
    'Objeto JSON inválido.',
  );
  for (const [key, child] of Object.entries(value)) {
    check(
      !/(secret|password|senha|token|authorization|credential|certificado|certificate|private.?key|client.?id|^csc$|^id.?csc$|^__proto__$|^constructor$|^prototype$)/i.test(
        key,
      ),
      'Credenciais não são permitidas no payload fiscal.',
    );
    inspectJson(child, depth + 1);
  }
}

export function validateFiscalPayload(
  raw: unknown,
  sale: FiscalSale,
  emitterCnpj: string,
  model: '55' | '65',
): Record<string, unknown> {
  inspectJson(raw);
  check(
    Buffer.byteLength(JSON.stringify(raw), 'utf8') <= 512_000,
    'Payload fiscal excede 512 KB.',
  );
  const parsed = envelope.parse(raw),
    info = parsed.infNFe;
  check(
    info.ide.mod === Number(model),
    'Modelo fiscal diferente do solicitado.',
  );
  check(
    validCnpj(emitterCnpj) && info.emit.CNPJ === emitterCnpj,
    'CNPJ emitente diferente da organização.',
  );
  check(
    model !== '55' || !!info.dest,
    'NF-e exige destinatário com endereço completo.',
  );
  check(
    model !== '65' || info.ide.tpImp === 4,
    'NFC-e exige DANFCE (tpImp 4).',
  );
  check(
    info.det.length === sale.items.length && sale.items.length > 0,
    'Itens fiscais diferentes da venda.',
  );
  const subtotal = money(sale.subtotal),
    discount = money(sale.discount),
    total = money(sale.total);
  check(
    subtotal.minus(discount).eq(total) && total.gt(0),
    'Totais comerciais inconsistentes.',
  );
  check(
    sum(sale.items.map((item) => money(item.total))).eq(subtotal),
    'Subtotal comercial inconsistente.',
  );
  const discounts = allocateDiscount(
    sale.items.map((item) => item.total),
    sale.discount,
  );
  // Sale line order fixes both item identity and the deterministic discount allocation.
  info.det.forEach((detail, index) => {
    const item = sale.items[index],
      product = detail.prod;
    check(
      detail.nItem === index + 1 && product.cProd === item.productId,
      'Produto fiscal diferente da venda.',
    );
    check(
      Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        new Decimal(product.qCom).eq(item.quantity),
      'Quantidade diferente da venda.',
    );
    check(
      new Decimal(product.vUnCom).eq(money(item.unitPrice)),
      'Preço unitário diferente da venda.',
    );
    check(
      money(item.unitPrice)
        .times(item.quantity)
        .toDecimalPlaces(2)
        .eq(money(item.total)),
      'Total do item comercial inconsistente.',
    );
    check(
      new Decimal(product.vProd).eq(item.total) &&
        new Decimal(product.qCom)
          .times(product.vUnCom)
          .toDecimalPlaces(2)
          .eq(product.vProd),
      'Total fiscal do item inconsistente.',
    );
    check(
      new Decimal(product.qTrib).gt(0) &&
        new Decimal(product.qTrib)
          .times(product.vUnTrib)
          .toDecimalPlaces(2)
          .eq(product.vProd),
      'Quantidade/valor tributável inconsistente.',
    );
    check(
      new Decimal(product.vDesc).eq(discounts[index]),
      'Rateio do desconto diferente da venda.',
    );
    for (const key of ['vFrete', 'vSeg', 'vOutro'] as const) {
      check(
        product[key] === undefined ||
          new Decimal(amount.parse(product[key])).isZero(),
        'Encargos adicionais não constam na venda.',
      );
    }
    for (const contributionName of ['PIS', 'COFINS'] as const) {
      for (const [name, group] of Object.entries(
        detail.imposto[contributionName],
      )) {
        check(
          new RegExp(`^${contributionName}(Aliq|Qtde|NT|Outr)$`).test(name),
          'Grupo de contribuição inválido.',
        );
        if (name.endsWith('Aliq')) {
          for (const field of [
            'vBC',
            `p${contributionName}`,
            `v${contributionName}`,
          ])
            amount.parse(group[field]);
        } else if (name.endsWith('Qtde')) {
          for (const field of ['qBCProd', 'vAliqProd', `v${contributionName}`])
            decimal(4).parse(group[field]);
        } else if (name.endsWith('Outr')) {
          amount.parse(group[`v${contributionName}`]);
          check(
            group.vBC !== undefined || group.qBCProd !== undefined,
            'Base de contribuição obrigatória.',
          );
          if (group.vBC !== undefined) {
            amount.parse(group.vBC);
            decimal(4).parse(group[`p${contributionName}`]);
          } else {
            decimal(4).parse(group.qBCProd);
            decimal(4).parse(group.vAliqProd);
          }
        }
      }
    }
    for (const [name, group] of Object.entries(detail.imposto.ICMS)) {
      check(
        /^ICMS(00|02|10|15|20|30|40|51|53|60|61|70|90|Part|ST)$|^ICMSSN(101|102|201|202|500|900)$/.test(
          name,
        ),
        'Grupo ICMS inválido.',
      );
      if (['ICMS00', 'ICMS10', 'ICMS20', 'ICMS51', 'ICMS70'].includes(name)) {
        for (const field of ['vBC', 'pICMS', 'vICMS'])
          amount.parse(group[field]);
        integer(0, 3).parse(group.modBC);
      }
    }
  });
  const fiscal = info.total.ICMSTot;
  check(
    new Decimal(fiscal.vProd).eq(subtotal) &&
      new Decimal(fiscal.vDesc).eq(discount) &&
      new Decimal(fiscal.vNF).eq(total),
    'Totais fiscais diferentes da venda.',
  );
  check(
    ['vFrete', 'vSeg', 'vOutro'].every((key) =>
      new Decimal(fiscal[key] as Decimal.Value).isZero(),
    ),
    'Encargos adicionais não constam na venda.',
  );
  const calculated = new Decimal(fiscal.vProd)
    .minus(fiscal.vDesc)
    .minus(fiscal.vICMSDeson)
    .plus(fiscal.vST)
    .plus(fiscal.vFCPST)
    .plus(fiscal.vII)
    .plus(fiscal.vIPI)
    .plus(fiscal.vIPIDevol);
  check(calculated.eq(fiscal.vNF), 'Composição do total fiscal inconsistente.');
  check(
    info.pag.detPag.every((payment) => payment.tPag !== '90'),
    'Venda exige forma de pagamento explícita.',
  );
  check(
    sum(info.pag.detPag.map((payment) => payment.vPag))
      .minus(info.pag.vTroco ?? 0)
      .eq(total),
    'Pagamentos fiscais não fecham o total da venda.',
  );
  // ACBr declares monetary/quantity fields as JSON numbers. Only normalize the
  // known fiscal sections after decimal comparisons; preserve extension data.
  const normalizeNumbers = (section: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(section)) {
      if (
        /^(v[A-Z]|p[A-Z]|qCom$|qTrib$)/.test(key) &&
        (typeof value === 'string' || typeof value === 'number')
      ) {
        const exact = decimal(10).parse(value),
          numeric = Number(exact);
        check(
          new Decimal(numeric).eq(exact),
          'Valor excede a precisão segura para JSON.',
        );
        section[key] = numeric;
      } else if (value && typeof value === 'object' && !Array.isArray(value))
        normalizeNumbers(value as Record<string, unknown>);
    }
  };
  for (const item of info.det) {
    normalizeNumbers(item.prod);
    normalizeNumbers(item.imposto);
  }
  normalizeNumbers(info.total);
  for (const payment of info.pag.detPag) normalizeNumbers(payment);
  if (info.pag.vTroco !== undefined) info.pag.vTroco = Number(info.pag.vTroco);
  return parsed;
}

/** Empty fields deliberately block issuance until reviewed and filled by the responsible accountant. */
export function buildFiscalTemplate(
  sale: FiscalSale,
  emitterCnpj: string,
  model: '55' | '65',
): Record<string, unknown> {
  const discounts = allocateDiscount(
    sale.items.map((item) => item.total),
    sale.discount,
  );
  const emptyAddress = () => ({
    xLgr: '',
    nro: '',
    xBairro: '',
    cMun: '',
    xMun: '',
    UF: '',
    CEP: '',
  });
  return {
    ambiente: 'homologacao',
    infNFe: {
      versao: '4.00',
      ide: {
        mod: Number(model),
        tpAmb: 2,
        cUF: '',
        natOp: '',
        serie: '',
        nNF: '',
        dhEmi: '',
        tpNF: '',
        idDest: '',
        cMunFG: '',
        tpImp: '',
        tpEmis: '',
        finNFe: '',
        indFinal: '',
        indPres: '',
        procEmi: '',
        verProc: '',
      },
      emit: {
        CNPJ: emitterCnpj,
        xNome: '',
        IE: '',
        CRT: '',
        enderEmit: emptyAddress(),
      },
      ...(model === '55'
        ? {
            dest: {
              CNPJ: '',
              xNome: '',
              indIEDest: '',
              enderDest: emptyAddress(),
            },
          }
        : {}),
      det: sale.items.map((item, index) => ({
        nItem: index + 1,
        prod: {
          cProd: item.productId,
          xProd: item.productName,
          NCM: '',
          CFOP: '',
          uCom: '',
          qCom: item.quantity,
          vUnCom: item.unitPrice,
          vProd: item.total,
          vDesc: discounts[index],
          uTrib: '',
          qTrib: '',
          vUnTrib: '',
          indTot: 1,
        },
        imposto: { ICMS: {}, PIS: {}, COFINS: {} },
      })),
      total: {
        ICMSTot: {
          ...Object.fromEntries(totalFields.map((key) => [key, ''])),
          vProd: sale.subtotal,
          vDesc: sale.discount,
          vNF: sale.total,
        },
      },
      transp: { modFrete: '' },
      pag: { detPag: [{ tPag: '', vPag: sale.total }] },
    },
  };
}

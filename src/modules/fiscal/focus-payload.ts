import Decimal from 'decimal.js';

type Data = Record<string, unknown>;
type Fields = Record<string, string>;
const unsupported = (field: string): never => {
  throw new Error(
    `Focus: campo ou perfil fiscal não suportado (${field}); solicite revisão do responsável fiscal.`,
  );
};
function object(value: unknown, path: string): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return unsupported(path);
  return value as Data;
}
function keys(value: Data, allowed: string[], path: string) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) unsupported(`${path}.${key}`);
}
function map(value: Data, fields: Fields): Data {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => value[key] !== undefined)
      .map(([key, target]) => [target, value[key]]),
  );
}
function list(value: unknown, path: string): Data[] {
  if (!Array.isArray(value) || value.length === 0) return unsupported(path);
  return value.map((item, index) => object(item, `${path}.${index}`));
}
const productFields = {
  cProd: 'codigo_produto',
  xProd: 'descricao',
  NCM: 'codigo_ncm',
  CFOP: 'cfop',
  uCom: 'unidade_comercial',
  qCom: 'quantidade_comercial',
  vUnCom: 'valor_unitario_comercial',
  vProd: 'valor_bruto',
  vDesc: 'valor_desconto',
  uTrib: 'unidade_tributavel',
  qTrib: 'quantidade_tributavel',
  vUnTrib: 'valor_unitario_tributavel',
  indTot: 'inclui_no_total',
  cEAN: 'codigo_barras_comercial',
  cEANTrib: 'codigo_barras_tributavel',
  CEST: 'cest',
  cBenef: 'codigo_beneficio_fiscal',
  vFrete: 'valor_frete',
  vSeg: 'valor_seguro',
  vOutro: 'valor_outras_despesas',
};
const totalFields = {
  vBC: 'icms_base_calculo',
  vICMS: 'icms_valor_total',
  vICMSDeson: 'icms_valor_total_desonerado',
  vFCP: 'fcp_valor_total',
  vBCST: 'icms_base_calculo_st',
  vST: 'icms_valor_total_st',
  vFCPST: 'fcp_valor_total_st',
  vFCPSTRet: 'fcp_valor_total_retido_st',
  vProd: 'valor_produtos',
  vFrete: 'valor_frete',
  vSeg: 'valor_seguro',
  vDesc: 'valor_desconto',
  vII: 'valor_total_ii',
  vIPI: 'valor_ipi',
  vIPIDevol: 'valor_ipi_devolvido',
  vPIS: 'valor_pis',
  vCOFINS: 'valor_cofins',
  vOutro: 'valor_outras_despesas',
  vNF: 'valor_total',
};
const addressFields = {
  xLgr: 'logradouro',
  nro: 'numero',
  xCpl: 'complemento',
  xBairro: 'bairro',
  cMun: 'codigo_municipio',
  xMun: 'municipio',
  UF: 'uf',
  CEP: 'cep',
  fone: 'telefone',
};
function party(value: unknown, role: 'emitente' | 'destinatario'): Data {
  const data = object(value, role);
  const fields: Fields =
    role === 'emitente'
      ? {
          CNPJ: 'cnpj_emitente',
          xNome: 'nome_emitente',
          xFant: 'nome_fantasia_emitente',
          IE: 'inscricao_estadual_emitente',
          CRT: 'regime_tributario_emitente',
        }
      : {
          CNPJ: 'cnpj_destinatario',
          CPF: 'cpf_destinatario',
          xNome: 'nome_destinatario',
          IE: 'inscricao_estadual_destinatario',
          indIEDest: 'indicador_inscricao_estadual_destinatario',
        };
  const addressKey = role === 'emitente' ? 'enderEmit' : 'enderDest';
  keys(data, [...Object.keys(fields), addressKey], role);
  const address = object(data[addressKey], `${role}.endereco`);
  keys(address, Object.keys(addressFields), `${role}.endereco`);
  return {
    ...map(data, fields),
    ...map(
      address,
      Object.fromEntries(
        Object.entries(addressFields).map(([source, target]) => [
          source,
          `${target}_${role}`,
        ]),
      ),
    ),
  };
}

/** Converts a sale-validated canonical envelope. Unsupported fiscal data is never discarded. */
export function toFocusPayload(canonical: Data, model: '55' | '65'): Data {
  keys(canonical, ['ambiente', 'referencia', 'infNFe'], 'payload');
  if (canonical.ambiente !== 'homologacao' || !['55', '65'].includes(model))
    unsupported('ambiente/modelo');
  const info = object(canonical.infNFe, 'infNFe');
  keys(
    info,
    [
      'versao',
      'ide',
      'emit',
      'dest',
      'det',
      'total',
      'transp',
      'pag',
      'infAdic',
    ],
    'infNFe',
  );
  const ide = object(info.ide, 'ide');
  keys(
    ide,
    [
      'cUF',
      'natOp',
      'mod',
      'serie',
      'nNF',
      'dhEmi',
      'tpNF',
      'idDest',
      'cMunFG',
      'tpImp',
      'tpEmis',
      'tpAmb',
      'finNFe',
      'indFinal',
      'indPres',
      'procEmi',
      'verProc',
    ],
    'ide',
  );
  // These technical controls are determined by the endpoint and the Focus emitter.
  // Reject alternate modes instead of silently changing their fiscal meaning.
  if (
    info.versao !== '4.00' ||
    ide.mod !== Number(model) ||
    ide.tpAmb !== 2 ||
    ide.tpEmis !== 1 ||
    ide.finNFe !== 1 ||
    ide.tpNF !== 1 ||
    ide.procEmi !== 0 ||
    ![1, 2].includes(Number(ide.idDest)) ||
    (model === '65' ? ide.tpImp !== 4 : ![1, 2].includes(Number(ide.tpImp)))
  )
    unsupported('modo de emissão');
  const emit = object(info.emit, 'emit');
  if (emit.CRT !== 4) unsupported('emit.CRT');
  const address = object(emit.enderEmit, 'emit.enderEmit');
  if (String(ide.cUF) !== String(address.cMun).slice(0, 2))
    unsupported('ide.cUF');
  const result: Data = {
    ambiente: 'homologacao',
    ...(canonical.referencia === undefined
      ? {}
      : { referencia: canonical.referencia }),
    ...map(ide, {
      natOp: 'natureza_operacao',
      serie: 'serie',
      nNF: 'numero',
      dhEmi: 'data_emissao',
      tpNF: 'tipo_documento',
      idDest: 'local_destino',
      cMunFG: 'municipio',
      finNFe: 'finalidade_emissao',
      indFinal: 'consumidor_final',
      indPres: 'presenca_comprador',
    }),
    ...party(emit, 'emitente'),
  };
  if (info.dest !== undefined)
    Object.assign(result, party(info.dest, 'destinatario'));
  else if (model === '55') unsupported('destinatário obrigatório');
  result.items = list(info.det, 'det').map((detail, index) => {
    keys(detail, ['nItem', 'prod', 'imposto', 'infAdProd'], `det.${index}`);
    const prod = object(detail.prod, 'prod'),
      tax = object(detail.imposto, 'imposto');
    keys(prod, Object.keys(productFields), 'prod');
    keys(tax, ['ICMS', 'PIS', 'COFINS'], 'imposto');
    const icms = object(tax.ICMS, 'ICMS');
    keys(icms, ['ICMSSN102'], 'ICMS');
    const simple = object(icms.ICMSSN102, 'ICMSSN102');
    keys(simple, ['orig', 'CSOSN'], 'ICMSSN102');
    if (!['102', '103', '300', '400'].includes(String(simple.CSOSN)))
      unsupported('CSOSN');
    const contributions: Data = {};
    for (const name of ['PIS', 'COFINS']) {
      const group = object(tax[name], name);
      keys(group, [`${name}NT`], name);
      const details = object(group[`${name}NT`], `${name}NT`);
      keys(details, ['CST'], `${name}NT`);
      if (!/^0[4-9]$/.test(String(details.CST))) unsupported(`${name}.CST`);
      contributions[`${name.toLowerCase()}_situacao_tributaria`] = details.CST;
    }
    return {
      numero_item: detail.nItem,
      ...map(prod, productFields),
      icms_origem: simple.orig,
      icms_situacao_tributaria: simple.CSOSN,
      ...contributions,
      ...(detail.infAdProd === undefined
        ? {}
        : { informacoes_adicionais_item: detail.infAdProd }),
    };
  });
  const total = object(info.total, 'total');
  keys(total, ['ICMSTot'], 'total');
  const amounts = object(total.ICMSTot, 'ICMSTot');
  keys(amounts, Object.keys(totalFields), 'ICMSTot');
  // No taxed groups are supported in this profile: nonzero taxes must not slip through as totals.
  for (const field of [
    'vBC',
    'vICMS',
    'vICMSDeson',
    'vFCP',
    'vBCST',
    'vST',
    'vFCPST',
    'vFCPSTRet',
    'vII',
    'vIPI',
    'vIPIDevol',
    'vPIS',
    'vCOFINS',
  ]) {
    if (
      amounts[field] === undefined ||
      !new Decimal(String(amounts[field])).isZero()
    )
      unsupported(`ICMSTot.${field}`);
  }
  Object.assign(result, map(amounts, totalFields));
  const transport = object(info.transp, 'transp');
  keys(transport, ['modFrete'], 'transp');
  result.modalidade_frete = transport.modFrete;
  const payment = object(info.pag, 'pag');
  keys(payment, ['detPag', 'vTroco'], 'pag');
  result.formas_pagamento = list(payment.detPag, 'detPag').map((part) => {
    const fields = {
      tPag: 'forma_pagamento',
      vPag: 'valor_pagamento',
      indPag: 'indicador_pagamento',
      xPag: 'descricao_pagamento',
    };
    keys(part, [...Object.keys(fields), 'card'], 'detPag');
    const output = map(part, fields);
    if (part.card !== undefined) {
      const card = object(part.card, 'card');
      const fields = {
        tpIntegra: 'tipo_integracao',
        CNPJ: 'cnpj_credenciadora',
        tBand: 'bandeira_operadora',
        cAut: 'numero_autorizacao',
      };
      keys(card, Object.keys(fields), 'card');
      Object.assign(output, map(card, fields));
    }
    return output;
  });
  if (payment.vTroco !== undefined) result.valor_troco = payment.vTroco;
  if (info.infAdic !== undefined) {
    const additional = object(info.infAdic, 'infAdic');
    keys(additional, ['infAdFisco', 'infCpl'], 'infAdic');
    Object.assign(
      result,
      map(additional, {
        infAdFisco: 'informacoes_adicionais_fisco',
        infCpl: 'informacoes_adicionais_contribuinte',
      }),
    );
  }
  return result;
}

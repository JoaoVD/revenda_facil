type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const filled = (value: unknown) =>
  value !== undefined && value !== null && String(value).trim() !== '';
export type DraftFields = {
  serie: string;
  nNF: string;
  dhEmi: string;
  natOp: string;
  idDest: string;
  indPres: string;
  indFinal: string;
  tPag: string;
  indPag: string;
  tpIntegra?: string;
};
function addressComplete(value: unknown) {
  const address = object(value);
  return ['xLgr', 'nro', 'xBairro', 'cMun', 'xMun', 'UF', 'CEP'].every((key) =>
    filled(address[key]),
  );
}
export function fiscalDraftIssues(template: unknown): string[] {
  const info = object(object(template).infNFe),
    emitter = object(info.emit),
    issues: string[] = [];
  if (
    !['CNPJ', 'xNome', 'IE'].every((key) => filled(emitter[key])) ||
    emitter.CRT !== 4 ||
    !addressComplete(emitter.enderEmit)
  )
    issues.push(
      'Complete o emitente (razão social, inscrição estadual, enquadramento MEI e endereço) em Configurações > Fiscal.',
    );
  if (object(emitter.enderEmit).UF !== 'SP')
    issues.push(
      'Esta preparação suporta emitente de São Paulo. Revise o cadastro fiscal.',
    );
  const dest = object(info.dest);
  if (info.dest && object(dest.enderDest).UF !== object(emitter.enderEmit).UF)
    issues.push(
      'Esta preparação exige destinatário do mesmo estado do emitente. Operação interestadual precisa de revisão técnica.',
    );
  if (
    (object(info.ide).mod === 55 || info.dest) &&
    (!filled(dest.CPF || dest.CNPJ) ||
      !filled(dest.xNome) ||
      ![1, 2, 9].includes(Number(dest.indIEDest)) ||
      !addressComplete(dest.enderDest))
  )
    issues.push(
      'Complete a identificação e o endereço fiscal do destinatário em Configurações > Fiscal.',
    );
  const details = Array.isArray(info.det) ? info.det : [];
  if (!details.length) issues.push('A venda precisa ter itens.');
  details.forEach((detail, index) => {
    const prod = object(object(detail).prod),
      tax = object(object(detail).imposto),
      name = String(prod.xProd || `Item ${index + 1}`);
    if (!/^\d{8}$/.test(String(prod.NCM || '')))
      issues.push(`${name}: informe NCM com 8 dígitos no cadastro fiscal.`);
    if (!/^5\d{3}$/.test(String(prod.CFOP || '')))
      issues.push(
        `${name}: esta preparação suporta CFOP de saída interna (5xxx). Revise a operação com o contador.`,
      );
    if (!filled(prod.uCom) || !filled(prod.uTrib) || prod.uCom !== prod.uTrib)
      issues.push(`${name}: configure unidades comercial e tributável iguais.`);
    const icms = object(tax.ICMS),
      group = object(icms.ICMSSN102),
      pis = object(object(tax.PIS).PISNT),
      cofins = object(object(tax.COFINS).COFINSNT);
    const exact = (obj: ObjectValue, keys: string[]) =>
      Object.keys(obj).every((key) => keys.includes(key));
    if (
      !exact(tax, ['ICMS', 'PIS', 'COFINS']) ||
      Object.keys(icms).length !== 1 ||
      !exact(group, ['orig', 'CSOSN']) ||
      !Number.isInteger(group.orig) ||
      Number(group.orig) < 0 ||
      Number(group.orig) > 8 ||
      !['102', '300', '400'].includes(String(group.CSOSN)) ||
      Object.keys(object(tax.PIS)).length !== 1 ||
      Object.keys(object(tax.COFINS)).length !== 1 ||
      !exact(pis, ['CST']) ||
      !exact(cofins, ['CST']) ||
      !['04', '05', '06', '07', '08', '09'].includes(String(pis.CST)) ||
      !['04', '05', '06', '07', '08', '09'].includes(String(cofins.CST))
    )
      issues.push(
        `${name}: tributação pendente ou não suportada. O contador deve cadastrar ICMS SN102 (CSOSN 102/300/400), PISNT e COFINSNT, sem tributos adicionais. Operações com impostos cobrados exigem revisão técnica.`,
      );
  });
  return issues;
}
export function composeFiscalDraft(template: unknown, fields: DraftFields) {
  const issues = fiscalDraftIssues(template);
  if (issues.length) throw new Error(issues.join(' '));
  if (
    object(object(template).infNFe).ide &&
    object(object(object(template).infNFe).ide).mod === 65 &&
    (fields.indFinal !== '1' || !['1', '4'].includes(fields.indPres))
  )
    throw new Error(
      'NFC-e exige consumidor final e operação presencial ou entrega em domicílio neste fluxo.',
    );
  if (
    !fields.natOp.trim() ||
    !/^\d+$/.test(fields.serie) ||
    Number(fields.serie) < 1 ||
    Number(fields.serie) > 999 ||
    !/^\d+$/.test(fields.nNF) ||
    Number(fields.nNF) < 1 ||
    Number(fields.nNF) > 999999999 ||
    !Number.isFinite(Date.parse(fields.dhEmi))
  )
    throw new Error(
      'Informe natureza da operação, série, número e data válidos.',
    );
  if (fields.idDest !== '1')
    throw new Error(
      'Esta preparação suporta somente operação interna, sem frete.',
    );
  if (
    !['0', '1', '2', '3', '4', '5', '9'].includes(fields.indPres) ||
    !['0', '1'].includes(fields.indFinal) ||
    !['0', '1'].includes(fields.indPag)
  )
    throw new Error(
      'Escolha presença, consumidor final e condição fiscal de pagamento.',
    );
  if (
    ![
      '01',
      '02',
      '03',
      '04',
      '05',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '21',
    ].includes(fields.tPag)
  )
    throw new Error('Escolha uma forma fiscal de pagamento suportada.');
  if (['03', '04'].includes(fields.tPag) && fields.tpIntegra !== '2')
    throw new Error(
      'Para cartão, confirme o pagamento não integrado. Cartão integrado exige revisão técnica.',
    );
  const raw = JSON.parse(JSON.stringify(template));
  const info = raw.infNFe;
  Object.assign(info.ide, {
    cUF: 35,
    natOp: fields.natOp.trim(),
    serie: Number(fields.serie),
    nNF: Number(fields.nNF),
    dhEmi: fields.dhEmi,
    tpNF: 1,
    idDest: 1,
    cMunFG: info.emit.enderEmit.cMun,
    tpImp: info.ide.mod === 65 ? 4 : 1,
    tpEmis: 1,
    tpAmb: 2,
    finNFe: 1,
    indFinal: Number(fields.indFinal),
    indPres: Number(fields.indPres),
    procEmi: 0,
    verProc: 'Revenda Facil 1.0',
  });
  const totals = info.total.ICMSTot;
  for (const key of Object.keys(totals))
    if (!['vProd', 'vDesc', 'vNF'].includes(key)) totals[key] = '0.00';
  info.transp = { modFrete: 9 };
  info.pag = {
    detPag: [
      {
        tPag: fields.tPag,
        indPag: Number(fields.indPag),
        vPag: totals.vNF,
        ...(['03', '04'].includes(fields.tPag)
          ? { card: { tpIntegra: 2 } }
          : {}),
      },
    ],
  };
  return raw;
}

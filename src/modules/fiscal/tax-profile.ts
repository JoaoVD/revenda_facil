export type TaxChoices = {
  origin: string;
  csosn: string;
  pis: string;
  cofins: string;
};
export function guidedTaxProfile(choices: TaxChoices) {
  if (
    !/^[0-8]$/.test(choices.origin) ||
    !['102', '300', '400'].includes(choices.csosn) ||
    !/^0[4-9]$/.test(choices.pis) ||
    !/^0[4-9]$/.test(choices.cofins)
  )
    return null;
  return {
    ICMS: { ICMSSN102: { orig: Number(choices.origin), CSOSN: choices.csosn } },
    PIS: { PISNT: { CST: choices.pis } },
    COFINS: { COFINSNT: { CST: choices.cofins } },
  };
}
export function readGuidedTaxProfile(value: unknown): TaxChoices | null {
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const tax = obj(value),
    icms = obj(tax.ICMS),
    simple = obj(icms.ICMSSN102),
    pis = obj(tax.PIS),
    cofins = obj(tax.COFINS);
  const exact = (v: Record<string, unknown>, keys: string[]) =>
    Object.keys(v).length === keys.length &&
    Object.keys(v).every((k) => keys.includes(k));
  if (
    !exact(tax, ['ICMS', 'PIS', 'COFINS']) ||
    !exact(icms, ['ICMSSN102']) ||
    !exact(simple, ['orig', 'CSOSN']) ||
    !exact(pis, ['PISNT']) ||
    !exact(cofins, ['COFINSNT']) ||
    !exact(obj(pis.PISNT), ['CST']) ||
    !exact(obj(cofins.COFINSNT), ['CST'])
  )
    return null;
  const choices = {
    origin: String(simple.orig),
    csosn: String(simple.CSOSN),
    pis: String(obj(pis.PISNT).CST),
    cofins: String(obj(cofins.COFINSNT).CST),
  };
  return guidedTaxProfile(choices) ? choices : null;
}

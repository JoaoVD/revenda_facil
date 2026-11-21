import { validNfeKey } from './invoice-contracts';

/**
 * Lê a chave de acesso de 44 dígitos a partir do que o leitor entregou:
 * código de barras do DANFE (só dígitos, às vezes com espaços), QR Code
 * com URL de consulta (parâmetros `chNFe` ou `p=CHAVE|...`) ou texto colado.
 * Tudo local: a chave já traz fornecedor, número, série e mês de emissão.
 */
export function extractNfeKey(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const compact = raw.replace(/[\s.\-/]/g, '');
  if (validNfeKey(compact)) return compact;
  for (const match of raw.matchAll(/\d{44}/g))
    if (validNfeKey(match[0])) return match[0];
  return null;
}

const states: Record<string, string> = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
};

export type NfeKeyDetails = {
  state: string;
  issued: string;
  supplierDocument: string;
  series: string;
  number: string;
};

/** Campos da chave (layout oficial da NF-e, modelo 55). */
export function describeNfeKey(key: string): NfeKeyDetails {
  const cnpj = key.slice(6, 20);
  return {
    state: states[key.slice(0, 2)] ?? key.slice(0, 2),
    issued: `${key.slice(4, 6)}/20${key.slice(2, 4)}`,
    supplierDocument: cnpj.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5',
    ),
    series: String(Number(key.slice(22, 25))),
    number: Number(key.slice(25, 34)).toLocaleString('pt-BR'),
  };
}

import { z } from 'zod';
import { BusinessError } from '@/lib/errors';
import { validCnpj } from '@/modules/organizations/validation';
import { MAX_XML_BYTES, nfeKey } from './invoice-contracts';

const ORIGIN = 'https://api.focusnfe.com.br';
const unavailable =
  'A nota ainda não está disponível na Focus. Importe o XML enviado pelo fornecedor.';
const noteStatus = z.object({
  chave_nfe: z.string(),
  cnpj_destinatario: z.string(),
  situacao: z.string(),
  nfe_completa: z.union([z.boolean(), z.string()]),
  data_cancelamento: z.string().nullish(),
});

export function focusReceivedToken(cnpj: string) {
  // Recebimento tem configuração própria. O token de emissão nunca é reutilizado.
  return validCnpj(cnpj) && cnpj === process.env.FOCUS_RECEIVED_CNPJ
    ? process.env.FOCUS_RECEIVED_TOKEN?.trim()
    : undefined;
}

async function limitedText(response: Response) {
  if (!response.body)
    throw new BusinessError('A Focus retornou um arquivo vazio.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let content = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return content + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_XML_BYTES)
        throw new BusinessError('O XML supera 250 KB.');
      content += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function lookupReceivedInvoice(
  cnpj: string,
  rawKey: string,
  fetcher: typeof fetch = fetch,
) {
  const token = focusReceivedToken(cnpj);
  if (!token)
    throw new BusinessError(
      'A busca pelo DANFE ainda não está configurada para esta revenda. Use Importar XML.',
    );
  const accessKey = nfeKey.parse(rawKey);
  const options: RequestInit = {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  };
  const get = async (suffix: string, accept: string) => {
    const response = await fetcher(
      ORIGIN + '/v2/nfes_recebidas/' + accessKey + suffix + '?cnpj=' + cnpj,
      {
        ...options,
        headers: {
          Accept: accept,
          Authorization: 'Basic ' + Buffer.from(token + ':').toString('base64'),
        },
      },
    );
    if (response.status === 404) throw new BusinessError(unavailable);
    if (!response.ok)
      throw new BusinessError(
        'A Focus não conseguiu consultar a nota. Confira a integração ou importe o XML do fornecedor.',
      );
    return limitedText(response);
  };
  try {
    const status = noteStatus.safeParse(
      JSON.parse(await get('.json', 'application/json')),
    );
    if (
      !status.success ||
      status.data.chave_nfe.replace(/^NFe/, '') !== accessKey ||
      status.data.cnpj_destinatario !== cnpj
    )
      throw new BusinessError(
        'A Focus retornou uma nota diferente da solicitada ou destinada a outra empresa.',
      );
    if (status.data.situacao !== 'autorizada' || status.data.data_cancelamento)
      throw new BusinessError(
        'A Focus não informa esta nota como autorizada. Confira a situação com o fornecedor.',
      );
    if (
      status.data.nfe_completa !== true &&
      status.data.nfe_completa !== 'true'
    )
      throw new BusinessError(
        'A Focus recebeu só o resumo da nota. Importe o XML completo do fornecedor ou confira a manifestação fiscal.',
      );
    return await get('.xml', 'application/xml');
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    throw new BusinessError(
      'Não foi possível baixar a nota pela Focus. Tente novamente ou importe o XML do fornecedor.',
    );
  }
}

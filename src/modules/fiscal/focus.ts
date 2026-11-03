/** Server-side Focus NFe transport. Only the fixed homologation host is reachable. */
import type { AcbrCancellation, AcbrDocument } from './acbr';
import { validCnpj } from '@/modules/organizations/validation';

type Model = '55' | '65';
type ObjectValue = Record<string, unknown>;
type Options = { token: string; environment?: string; fetch?: typeof fetch };
const ORIGIN = 'https://homologacao.focusnfe.com.br';
const fail = (message: string): never => {
  throw new Error(`Focus: ${message}`);
};
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const protocol = (value: unknown): string | null =>
  typeof value === 'string' && /^(\d{15}|\d{17})$/.test(value) ? value : null;
function referencePath(model: Model, reference?: string): string {
  if (model !== '55' && model !== '65') fail('modelo fiscal inválido.');
  if (reference !== undefined && !/^[A-Za-z0-9_-]{1,50}$/.test(reference))
    fail('referência fiscal inválida.');
  return `/v2/${model === '55' ? 'nfe' : 'nfce'}${reference === undefined ? '' : `/${reference}`}`;
}
function assertEnvironment(value: ObjectValue) {
  if (
    value.ambiente !== undefined &&
    !['homologacao', '2', 2].includes(value.ambiente as string | number)
  )
    fail('ambiente retornado incompatível.');
  for (const section of [
    'protocolo_nota_fiscal',
    'protocolo_cancelamento',
    'requisicao_nota_fiscal',
  ]) {
    if (object(value[section])) assertEnvironment(value[section]);
  }
}
function identity(
  value: unknown,
  reference: string,
  requireRef: boolean,
): ObjectValue {
  if (
    !object(value) ||
    typeof value.status !== 'string' ||
    !value.status.trim()
  )
    fail('resposta fiscal inválida.');
  const data = value as ObjectValue;
  if (
    (requireRef && data.ref !== reference) ||
    (data.ref !== undefined && data.ref !== reference)
  )
    fail('referência retornada incompatível.');
  if (
    data.cnpj_emitente !== undefined &&
    (typeof data.cnpj_emitente !== 'string' || !validCnpj(data.cnpj_emitente))
  )
    fail('CNPJ retornado inválido.');
  assertEnvironment(data);
  return data;
}
function accessKey(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^(NFe)?\d{44}$/.test(value))
    fail('chave retornada inválida.');
  return (value as string).replace(/^NFe/, '');
}
function normalize(value: unknown, reference: string): AcbrDocument {
  const data = identity(value, reference, true);
  const auth = object(data.protocolo_nota_fiscal)
    ? data.protocolo_nota_fiscal
    : {};
  // Top-level numero_protocolo on a cancelled document belongs to the event.
  const number =
    protocol(auth.numero_protocolo) ??
    (data.status === 'autorizado' ? protocol(data.numero_protocolo) : null);
  const event = object(data.protocolo_cancelamento)
    ? data.protocolo_cancelamento
    : {};
  const key = accessKey(data.chave_nfe ?? event.chave_nfe);
  const eventCode = event.status ?? data.status_sefaz;
  const confirmedCancellation =
    !!key &&
    (protocol(event.numero_protocolo)
      ? eventCode === undefined || ['135', '155'].includes(String(eventCode))
      : !!protocol(data.numero_protocolo) &&
        ['135', '155'].includes(String(data.status_sefaz)));
  return {
    id: reference,
    referencia: reference,
    ambiente: 'homologacao',
    status:
      data.status === 'processando_autorizacao'
        ? 'processando'
        : data.status === 'erro_autorizacao'
          ? 'rejeitado'
          : data.status === 'cancelado' && !confirmedCancellation
            ? 'cancelamento_nao_confirmado'
            : String(data.status),
    chave: key,
    autorizacao: {
      numero_protocolo: number,
      ...(typeof data.status_sefaz === 'string' &&
      /^\d+$/.test(data.status_sefaz)
        ? { codigo_status: Number(data.status_sefaz) }
        : {}),
    },
    ...(typeof data.cnpj_emitente === 'string'
      ? { cnpj_emitente: data.cnpj_emitente }
      : {}),
    ...(typeof data.numero === 'string' ? { numero: data.numero } : {}),
    ...(typeof data.serie === 'string' ? { serie: data.serie } : {}),
  };
}
function cancellation(value: unknown, reference: string): AcbrCancellation {
  const data = identity(value, reference, false);
  const event = object(data.protocolo_cancelamento)
    ? data.protocolo_cancelamento
    : {};
  const number =
    protocol(event.numero_protocolo) ??
    (data.status === 'cancelado' ? protocol(data.numero_protocolo) : null);
  const code = event.status ?? data.status_sefaz;
  const registered =
    data.status === 'cancelado' &&
    !!number &&
    (code === undefined || ['135', '155'].includes(String(code)));
  return {
    id: registered ? number! : '',
    status: registered
      ? 'registrado'
      : data.status === 'erro_cancelamento'
        ? 'rejeitado'
        : 'pendente',
    ambiente: 'homologacao',
    numero_protocolo: registered ? number : null,
    ...(accessKey(event.chave_nfe ?? data.chave_nfe)
      ? { chave_acesso: accessKey(event.chave_nfe ?? data.chave_nfe)! }
      : {}),
    ...(typeof code === 'string' && /^\d+$/.test(code)
      ? { codigo_status: Number(code) }
      : {}),
  };
}

export class FocusClient {
  private readonly fetcher: typeof fetch;
  private readonly authorization: string;
  constructor(options: Options) {
    if (
      options.environment !== undefined &&
      options.environment !== 'homologacao'
    )
      fail('somente homologação está habilitada.');
    if (!/^[A-Za-z0-9_-]+$/.test(options.token))
      fail('token não configurado ou inválido.');
    this.authorization = `Basic ${Buffer.from(`${options.token}:`).toString('base64')}`;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }
  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    read: (response: Response) => Promise<T>,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.fetcher(`${ORIGIN}${path}`, {
        method,
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-store',
        headers: {
          Authorization: this.authorization,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return await read(response);
    } catch {
      return fail(
        'falha na comunicação ou resposta do provedor; consulte antes de reenviar.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
  private json(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    body?: unknown,
    missing = false,
  ): Promise<unknown> {
    return this.request(
      path,
      method,
      async (response) => {
        if (missing && response.status === 404) {
          const value: unknown = await response.json();
          if (object(value) && value.codigo === 'nao_encontrado') return null;
        }
        if (!response.ok)
          fail(`requisição recusada (HTTP ${response.status}).`);
        return response.json();
      },
      body,
    );
  }
  async submit(model: Model, payload: ObjectValue): Promise<AcbrDocument> {
    const base = referencePath(model);
    if (typeof payload.referencia !== 'string')
      fail('referência fiscal obrigatória.');
    const reference = payload.referencia as string;
    referencePath(model, reference);
    if (
      payload.ambiente !== 'homologacao' ||
      typeof payload.cnpj_emitente !== 'string' ||
      !validCnpj(payload.cnpj_emitente)
    )
      fail('payload exige homologação e CNPJ válido.');
    const { referencia: _reference, ambiente: _environment, ...body } = payload;
    void _reference;
    void _environment;
    const result = normalize(
      await this.json(
        `${base}?ref=${encodeURIComponent(reference)}&completa=1`,
        'POST',
        body,
      ),
      reference,
    );
    if (
      result.cnpj_emitente !== undefined &&
      result.cnpj_emitente !== payload.cnpj_emitente
    )
      fail('CNPJ retornado incompatível.');
    return result;
  }
  private raw(model: Model, reference: string, missing = false) {
    return this.json(
      `${referencePath(model, reference)}?completa=1`,
      'GET',
      undefined,
      missing,
    );
  }
  async get(model: Model, reference: string): Promise<AcbrDocument> {
    return normalize(await this.raw(model, reference), reference);
  }
  async find(
    model: Model,
    cnpj: string,
    reference: string,
  ): Promise<AcbrDocument | null> {
    if (!validCnpj(cnpj)) fail('CNPJ inválido.');
    const value = await this.raw(model, reference, true);
    if (value === null) return null;
    const result = normalize(value, reference);
    if (result.cnpj_emitente !== cnpj) fail('CNPJ retornado incompatível.');
    return result;
  }
  async cancel(
    model: Model,
    reference: string,
    reason: string,
  ): Promise<AcbrCancellation> {
    const path = referencePath(model, reference);
    if (reason.trim().length < 15 || reason.trim().length > 255)
      fail('justificativa deve ter entre 15 e 255 caracteres.');
    return cancellation(
      await this.json(path, 'DELETE', { justificativa: reason.trim() }),
      reference,
    );
  }
  async getCancellation(
    model: Model,
    reference: string,
  ): Promise<AcbrCancellation> {
    return cancellation(await this.raw(model, reference), reference);
  }
  private artifactPath(value: unknown, format: 'xml' | 'pdf' | 'html'): string {
    if (
      typeof value !== 'string' ||
      /[%\\?#\s]/.test(value) ||
      value.includes('..')
    )
      fail('caminho de arquivo inválido.');
    const path = value as string;
    const url = new URL(path, ORIGIN);
    if (url.origin !== ORIGIN || url.username || url.password)
      fail('origem do arquivo inválida.');
    const allowed =
      format === 'html'
        ? /^\/notas_fiscais_consumidor\/NFe\d{44}\.html$/
        : format === 'xml'
          ? /^\/arquivos_development\/\d{14}\/\d{6}\/XMLs\/\d{44}-(nfe|can)\.xml$/
          : /^\/arquivos_development\/\d{14}\/\d{6}\/DANFEs\/\d{44}\.pdf$/;
    if (!allowed.test(url.pathname))
      fail('caminho ou formato do arquivo incompatível.');
    return url.pathname;
  }
  private async downloadArtifact(
    model: Model,
    reference: string,
    kind: 'xml' | 'pdf' | 'cancellation',
  ): Promise<Uint8Array> {
    const data = identity(await this.raw(model, reference), reference, true);
    const format = kind === 'pdf' ? (model === '65' ? 'html' : 'pdf') : 'xml';
    const field =
      kind === 'cancellation'
        ? 'caminho_xml_cancelamento'
        : kind === 'xml'
          ? 'caminho_xml_nota_fiscal'
          : 'caminho_danfe';
    const path = this.artifactPath(data[field], format);
    const key = accessKey(data.chave_nfe);
    const fileKey = path.match(/(?:\/|NFe)(\d{44})(?:-|\.)/)?.[1];
    const fileCnpj = path.match(/^\/arquivos_development\/(\d{14})\//)?.[1];
    if (
      (key && fileKey !== key) ||
      (fileCnpj && data.cnpj_emitente !== fileCnpj)
    )
      fail('arquivo não corresponde ao documento consultado.');
    if (
      (kind === 'xml' && !path.endsWith('-nfe.xml')) ||
      (kind === 'cancellation' && !path.endsWith('-can.xml'))
    )
      fail('tipo do XML incompatível.');
    return this.request(path, 'GET', async (response) => {
      if (!response.ok) fail('arquivo não disponível.');
      const type = response.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase();
      const accepted =
        format === 'xml'
          ? ['application/xml', 'text/xml']
          : format === 'html'
            ? ['text/html']
            : ['application/pdf'];
      if (!type || !accepted.includes(type))
        fail('conteúdo do arquivo incompatível.');
      return new Uint8Array(await response.arrayBuffer());
    });
  }
  async download(
    model: Model,
    reference: string,
    format: 'xml' | 'pdf',
  ): Promise<Uint8Array> {
    if (format !== 'xml' && format !== 'pdf') fail('formato inválido.');
    return this.downloadArtifact(model, reference, format);
  }
  async downloadCancellation(
    model: Model,
    reference: string,
  ): Promise<Uint8Array> {
    return this.downloadArtifact(model, reference, 'cancellation');
  }
}

let singleton: { token: string; client: FocusClient } | undefined;
export function focusClient(): FocusClient {
  const environment = process.env.FOCUS_NFE_ENVIRONMENT;
  if (environment !== undefined && environment !== 'homologacao')
    fail('somente homologação está habilitada.');
  const token = process.env.FOCUS_NFE_TOKEN ?? '';
  if (singleton?.token === token) return singleton.client;
  const client = new FocusClient({ token, environment });
  singleton = { token, client };
  return client;
}

/** Server-only ACBr homologation transport. Never import credentials into client components. */
export type AcbrDocument = {
  id: string;
  status: string;
  ambiente: 'homologacao';
  referencia?: string | null;
  chave?: string | null;
  autorizacao?: {
    numero_protocolo?: string | null;
    codigo_status?: number;
    motivo_status?: string;
    status?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

export type AcbrCancellation = {
  id: string;
  status: 'pendente' | 'registrado' | 'rejeitado' | 'erro';
  ambiente: 'homologacao';
  chave_acesso?: string;
  numero_protocolo?: string | null;
  codigo_status?: number;
  motivo_status?: string;
  [key: string]: unknown;
};

type Model = '55' | '65';
type Options = { clientId: string; clientSecret: string; fetch?: typeof fetch };
const AUTH_URL =
  'https://auth.acbr.api.br/realms/ACBrAPI/protocol/openid-connect/token';
const API_URL = 'https://hom.acbr.api.br';
const fail = (message: string): never => {
  throw new Error(`ACBr: ${message}`);
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function documentResponse(value: unknown): AcbrDocument {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !/^[A-Za-z0-9_-]+$/.test(value.id) ||
    value.ambiente !== 'homologacao' ||
    typeof value.status !== 'string' ||
    !value.status.trim()
  ) {
    return fail('resposta fiscal inválida ou ambiente incompatível.');
  }
  return value as AcbrDocument;
}

function path(model: Model, id?: string): string {
  if (model !== '55' && model !== '65') return fail('modelo fiscal inválido.');
  if (id !== undefined && !/^[A-Za-z0-9_-]+$/.test(id))
    return fail('identificador fiscal inválido.');
  return `/${model === '55' ? 'nfe' : 'nfce'}${id === undefined ? '' : `/${id}`}`;
}

function cancellationResponse(value: unknown): AcbrCancellation {
  const event = documentResponse(value);
  if (
    !['pendente', 'registrado', 'rejeitado', 'erro'].includes(event.status) ||
    (event.chave_acesso !== undefined &&
      (typeof event.chave_acesso !== 'string' ||
        !/^\d{44}$/.test(event.chave_acesso))) ||
    (event.numero_protocolo !== undefined &&
      event.numero_protocolo !== null &&
      (typeof event.numero_protocolo !== 'string' ||
        !event.numero_protocolo.trim()))
  )
    return fail('resposta de cancelamento inválida.');
  return event as AcbrCancellation;
}

export class AcbrClient {
  private readonly fetcher: typeof fetch;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private token?: { value: string; expires: number };
  private tokenRequest?: Promise<string>;

  constructor(options: Options) {
    if (!options.clientId.trim() || !options.clientSecret.trim())
      fail('credenciais não configuradas.');
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  // The deadline also covers response-body consumption. Provider bodies and original
  // errors are deliberately excluded from thrown errors (they may contain secrets).
  private async request<T>(
    url: string,
    init: RequestInit,
    read: (response: Response) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.fetcher(url, {
        ...init,
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok)
        return fail(`requisição recusada (HTTP ${response.status}).`);
      return await read(response);
    } catch {
      return fail(
        'falha na comunicação ou resposta do provedor; consulte antes de reenviar.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expires) return this.token.value;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = (async () => {
      const value: unknown = await this.request(
        AUTH_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
            scope: 'nfe nfce',
          }).toString(),
        },
        (response) => response.json(),
      );
      if (
        !record(value) ||
        typeof value.access_token !== 'string' ||
        !value.access_token.trim() ||
        typeof value.expires_in !== 'number' ||
        !Number.isFinite(value.expires_in) ||
        value.expires_in <= 0 ||
        (value.token_type !== undefined &&
          String(value.token_type).toLowerCase() !== 'bearer')
      ) {
        return fail('resposta de autenticação inválida.');
      }
      this.token = {
        value: value.access_token,
        expires: Date.now() + Math.max(0, value.expires_in - 30) * 1000,
      };
      return this.token.value;
    })();
    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = undefined;
    }
  }

  private async api<T>(
    endpoint: string,
    method: 'GET' | 'POST',
    read: (response: Response) => Promise<T>,
    body?: unknown,
  ): Promise<T> {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const token = await this.accessToken();
    return this.request(
      `${API_URL}${endpoint}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(serialized === undefined ? {} : { body: serialized }),
      },
      read,
    );
  }

  async submit(
    model: Model,
    payload: Record<string, unknown>,
  ): Promise<AcbrDocument> {
    const endpoint = path(model);
    const ide =
      record(payload.infNFe) && record(payload.infNFe.ide)
        ? payload.infNFe.ide
        : undefined;
    if (
      payload.ambiente !== 'homologacao' ||
      !ide ||
      ide.tpAmb !== 2 ||
      ide.mod !== Number(model)
    ) {
      return fail(
        'payload exige homologação, tpAmb 2 e modelo correspondente.',
      );
    }
    return documentResponse(
      await this.api(endpoint, 'POST', (response) => response.json(), payload),
    );
  }

  async get(model: Model, id: string): Promise<AcbrDocument> {
    const value = documentResponse(
      await this.api(path(model, id), 'GET', (response) => response.json()),
    );
    if (value.id !== id)
      return fail('identificador retornado não corresponde à consulta.');
    return value;
  }

  async find(
    model: Model,
    cnpj: string,
    reference: string,
  ): Promise<AcbrDocument | null> {
    const endpoint = path(model);
    if (!/^\d{14}$/.test(cnpj) || !reference.trim() || reference.length > 50)
      return fail('emitente ou referência inválidos.');
    let skip = 0;
    let count: number | undefined;
    const matches = new Map<string, AcbrDocument>();
    // A changing collection, truncated page, repeated ID or unbounded result is
    // inconclusive: callers must reconcile/review, never infer permission to POST.
    for (let page = 0; page < 100; page++) {
      const query = new URLSearchParams({
        cpf_cnpj: cnpj,
        referencia: reference,
        ambiente: 'homologacao',
        $top: '100',
        $skip: String(skip),
        $inlinecount: 'true',
      });
      const value: unknown = await this.api(
        `${endpoint}?${query}`,
        'GET',
        (response) => response.json(),
      );
      if (
        !record(value) ||
        !Array.isArray(value.data) ||
        typeof value['@count'] !== 'number' ||
        !Number.isSafeInteger(value['@count']) ||
        value['@count'] < 0 ||
        value.data.length > 100
      )
        return fail('consulta de referência incompleta.');
      const total = value['@count'];
      if (count !== undefined && count !== total)
        return fail('consulta de referência instável ou ambígua.');
      count = total;
      if (
        skip + value.data.length > total ||
        (value.data.length === 0 && skip < total)
      )
        return fail('consulta de referência incompleta.');
      for (const item of value.data) {
        const doc = documentResponse(item);
        if (doc.referencia !== reference || matches.has(doc.id))
          return fail('consulta de referência inconsistente ou ambígua.');
        matches.set(doc.id, doc);
      }
      skip += value.data.length;
      if (skip === total) {
        if (matches.size > 1)
          return fail('referência ambígua; revisão necessária.');
        return matches.values().next().value ?? null;
      }
    }
    return fail('consulta de referência incompleta; revisão necessária.');
  }

  async download(
    model: Model,
    id: string,
    format: 'xml' | 'pdf',
  ): Promise<Uint8Array> {
    if (format !== 'xml' && format !== 'pdf') return fail('formato inválido.');
    return this.api(
      `${path(model, id)}/${format}`,
      'GET',
      async (response) => new Uint8Array(await response.arrayBuffer()),
    );
  }

  async downloadCancellation(model: Model, id: string): Promise<Uint8Array> {
    return this.api(
      `${path(model, id)}/cancelamento/xml`,
      'GET',
      async (response) => new Uint8Array(await response.arrayBuffer()),
    );
  }

  async getCancellation(model: Model, id: string): Promise<AcbrCancellation> {
    return cancellationResponse(
      await this.api(`${path(model, id)}/cancelamento`, 'GET', (response) =>
        response.json(),
      ),
    );
  }

  async cancel(
    model: Model,
    id: string,
    reason: string,
  ): Promise<AcbrCancellation> {
    const endpoint = `${path(model, id)}/cancelamento`;
    if (reason.trim().length < 15 || reason.trim().length > 255)
      return fail('justificativa deve ter entre 15 e 255 caracteres.');
    return cancellationResponse(
      await this.api(endpoint, 'POST', (response) => response.json(), {
        justificativa: reason.trim(),
      }),
    );
  }
}

let singleton:
  { clientId: string; clientSecret: string; value: AcbrClient } | undefined;
export function acbrClient(): AcbrClient {
  if (
    process.env.ACBR_ENVIRONMENT !== undefined &&
    process.env.ACBR_ENVIRONMENT !== 'homologacao'
  )
    fail('somente homologação está habilitada.');
  const clientId = process.env.ACBR_CLIENT_ID ?? '';
  const clientSecret = process.env.ACBR_CLIENT_SECRET ?? '';
  if (
    singleton?.clientId === clientId &&
    singleton.clientSecret === clientSecret
  )
    return singleton.value;
  const value = new AcbrClient({ clientId, clientSecret });
  singleton = { clientId, clientSecret, value };
  return value;
}

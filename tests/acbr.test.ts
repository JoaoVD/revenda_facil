import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcbrClient, acbrClient } from '../src/modules/fiscal/acbr';

const document = {
  id: 'doc-1',
  ambiente: 'homologacao',
  status: 'pendente',
  referencia: 'sale-1',
};
const payload = {
  ambiente: 'homologacao',
  infNFe: { ide: { tpAmb: 2, mod: 65 } },
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function transport(...responses: (Response | Error)[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetcher.mockRejectedValueOnce(response);
    else fetcher.mockResolvedValueOnce(response);
  }
  return fetcher;
}
const token = () =>
  json({
    access_token: 'private-token',
    expires_in: 300,
    token_type: 'Bearer',
  });
const client = (fetcher: typeof fetch) =>
  new AcbrClient({ clientId: 'id', clientSecret: 'secret', fetch: fetcher });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('ACBr homologation transport', () => {
  it.each(['55', '65'] as const)(
    'downloads cancellation XML for model %s',
    async (model) => {
      const fetcher = transport(token(), new Response('<procEventoNFe/>'));
      const bytes = await client(fetcher).downloadCancellation(model, 'doc-1');
      expect(new TextDecoder().decode(bytes)).toBe('<procEventoNFe/>');
      expect(fetcher.mock.calls[1][0]).toBe(
        `https://hom.acbr.api.br/${model === '55' ? 'nfe' : 'nfce'}/doc-1/cancelamento/xml`,
      );
      expect(fetcher.mock.calls[1][1]?.method).toBe('GET');
    },
  );

  it.each(['55', '65'] as const)(
    'consults the cancellation event for model %s',
    async (model) => {
      const event = {
        id: 'evt-1',
        ambiente: 'homologacao',
        status: 'registrado',
        chave_acesso: '1'.repeat(44),
        numero_protocolo: '123',
      };
      const fetcher = transport(token(), json(event));
      expect(await client(fetcher).getCancellation(model, 'doc-1')).toEqual(
        event,
      );
      expect(fetcher.mock.calls[1][0]).toBe(
        `https://hom.acbr.api.br/${model === '55' ? 'nfe' : 'nfce'}/doc-1/cancelamento`,
      );
      expect(fetcher.mock.calls[1][1]?.method).toBe('GET');
    },
  );

  it.each(['pendente', 'registrado', 'rejeitado', 'erro'])(
    'preserves cancellation event state %s',
    async (status) => {
      const event = { id: 'evt-1', ambiente: 'homologacao', status };
      const fetcher = transport(token(), json(event));
      expect(
        await client(fetcher).cancel(
          '65',
          'doc-1',
          'Justificativa de cancelamento',
        ),
      ).toEqual(event);
    },
  );

  it.each([
    { id: '', ambiente: 'homologacao', status: 'pendente' },
    { id: 'evt-1', ambiente: 'producao', status: 'pendente' },
    { id: 'evt-1', ambiente: 'homologacao', status: 'autorizado' },
    {
      id: 'evt-1',
      ambiente: 'homologacao',
      status: 'pendente',
      chave_acesso: 'invalid',
    },
    {
      id: 'evt-1',
      ambiente: 'homologacao',
      status: 'pendente',
      numero_protocolo: {},
    },
  ])(
    'rejects malformed cancellation events from both operations',
    async (event) => {
      await expect(
        client(transport(token(), json(event))).getCancellation('65', 'doc-1'),
      ).rejects.toThrow();
      await expect(
        client(transport(token(), json(event))).cancel(
          '65',
          'doc-1',
          'Justificativa de cancelamento',
        ),
      ).rejects.toThrow();
    },
  );

  it('aborts stalled requests without retrying or exposing transport details', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('secret private-token')),
          );
        }),
    );
    const outcome = client(fetcher)
      .get('65', 'doc-1')
      .catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toMatch(/secret|private-token/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('shares authentication between concurrent lookups', async () => {
    const fetcher = transport(token(), json(document), json(document));
    const api = client(fetcher);
    await Promise.all([api.get('65', 'doc-1'), api.get('65', 'doc-1')]);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).includes('openid-connect'),
      ),
    ).toHaveLength(1);
  });

  it.each([
    { access_token: 'secret' },
    { access_token: 'secret', expires_in: -1 },
    { access_token: '', expires_in: 300 },
  ])('rejects malformed tokens before the fiscal request', async (value) => {
    const fetcher = transport(json(value));
    await expect(client(fetcher).get('65', 'doc-1')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched document IDs', async () => {
    await expect(
      client(transport(token(), json({ ...document, id: 'doc-other' }))).get(
        '55',
        'doc-1',
      ),
    ).rejects.toThrow();
  });

  it('rejects cancellation responses in production', async () => {
    await expect(
      client(
        transport(token(), json({ ...document, ambiente: 'producao' })),
      ).cancel('65', 'doc-1', 'Motivo informado pelo comprador'),
    ).rejects.toThrow();
  });

  it('authenticates with OAuth and submits to fixed homologation endpoint', async () => {
    const fetcher = transport(token(), json(document));
    expect(await client(fetcher).submit('65', payload)).toEqual(document);
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://auth.acbr.api.br/realms/ACBrAPI/protocol/openid-connect/token',
    );
    const auth = fetcher.mock.calls[0][1]!;
    expect(new URLSearchParams(String(auth.body)).get('grant_type')).toBe(
      'client_credentials',
    );
    expect(new URLSearchParams(String(auth.body)).get('scope')).toBe(
      'nfe nfce',
    );
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe('https://hom.acbr.api.br/nfce');
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      body: JSON.stringify(payload),
    });
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer private-token',
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    { ...payload, ambiente: 'producao' },
    { ...payload, infNFe: { ide: { tpAmb: 1, mod: 65 } } },
    { ...payload, infNFe: { ide: { tpAmb: 2, mod: 55 } } },
    {},
  ])('blocks unsafe payload before any network call', async (value) => {
    const fetcher = transport();
    await expect(client(fetcher).submit('65', value)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('caches tokens and renews before expiry', async () => {
    vi.useFakeTimers();
    const fetcher = transport(
      token(),
      json(document),
      json(document),
      token(),
      json(document),
    );
    const api = client(fetcher);
    await api.get('55', 'doc-1');
    await api.get('55', 'doc-1');
    vi.advanceTimersByTime(280_000);
    await api.get('55', 'doc-1');
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).includes('openid-connect'),
      ),
    ).toHaveLength(2);
  });

  it('snapshots the validated payload before awaiting authentication', async () => {
    let authenticate!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      authenticate = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(json(document));
    const value = structuredClone(payload);
    const submitting = client(fetcher).submit('65', value);
    value.ambiente = 'producao';
    value.infNFe.ide.tpAmb = 1;
    authenticate(token());
    await submitting;
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(payload);
  });

  it.each([
    json({ error: 'secret private-token' }, 401),
    new Error('secret private-token'),
  ])(
    'never retries a failed submission or exposes provider details',
    async (response) => {
      const fetcher = transport(token(), response);
      await expect(client(fetcher).submit('65', payload)).rejects.toThrow(
        /^ACBr:/,
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { ...document, ambiente: 'producao' },
    { ...document, id: '' },
    { ...document, status: null },
  ])('rejects malformed or wrong-environment documents', async (value) => {
    await expect(
      client(transport(token(), json(value))).get('65', 'doc-1'),
    ).rejects.toThrow();
  });

  it('preserves unknown statuses for conservative service mapping', async () => {
    expect(
      (
        await client(
          transport(token(), json({ ...document, status: 'future-status' })),
        ).get('65', 'doc-1')
      ).status,
    ).toBe('future-status');
  });

  it('reconciles using scoped reference filters and verifies all pages', async () => {
    const fetcher = transport(
      token(),
      json({ '@count': 2, data: [document] }),
      json({ '@count': 2, data: [{ ...document, id: 'doc-2' }] }),
    );
    await expect(
      client(fetcher).find('65', '12345678000190', 'sale-1'),
    ).rejects.toThrow(/amb/);
    const first = new URL(String(fetcher.mock.calls[1][0]));
    expect(first.searchParams.get('cpf_cnpj')).toBe('12345678000190');
    expect(first.searchParams.get('ambiente')).toBe('homologacao');
    expect(first.searchParams.get('referencia')).toBe('sale-1');
    expect(
      new URL(String(fetcher.mock.calls[2][0])).searchParams.get('$skip'),
    ).toBe('1');
  });

  it('returns null only after an exhaustive empty search', async () => {
    expect(
      await client(transport(token(), json({ '@count': 0, data: [] }))).find(
        '55',
        '12345678000190',
        'sale-1',
      ),
    ).toBeNull();
  });

  it('returns a unique reference match', async () => {
    expect(
      await client(
        transport(token(), json({ '@count': 1, data: [document] })),
      ).find('55', '12345678000190', 'sale-1'),
    ).toEqual(document);
  });

  it.each([
    { '@count': 2, data: [] },
    { data: [document] },
    { '@count': 1, data: [{ ...document, referencia: 'other' }] },
  ])('fails closed on incomplete or unscoped reconciliation', async (page) => {
    await expect(
      client(transport(token(), json(page))).find(
        '65',
        '12345678000190',
        'sale-1',
      ),
    ).rejects.toThrow();
  });

  it('downloads bytes from fixed document endpoints', async () => {
    const fetcher = transport(
      token(),
      new Response('<xml/>'),
      new Response('%PDF'),
    );
    const api = client(fetcher);
    expect(
      new TextDecoder().decode(await api.download('55', 'doc-1', 'xml')),
    ).toBe('<xml/>');
    expect(
      new TextDecoder().decode(await api.download('65', 'doc-1', 'pdf')),
    ).toBe('%PDF');
    expect(fetcher.mock.calls[1][0]).toBe(
      'https://hom.acbr.api.br/nfe/doc-1/xml',
    );
    expect(fetcher.mock.calls[2][0]).toBe(
      'https://hom.acbr.api.br/nfce/doc-1/pdf',
    );
  });

  it('posts a cancellation reason and preserves pending status', async () => {
    const fetcher = transport(token(), json(document));
    expect(
      await client(fetcher).cancel(
        '65',
        'doc-1',
        'Cancelamento solicitado pelo comprador',
      ),
    ).toEqual(document);
    expect(fetcher.mock.calls[1][0]).toBe(
      'https://hom.acbr.api.br/nfce/doc-1/cancelamento',
    );
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      justificativa: 'Cancelamento solicitado pelo comprador',
    });
  });

  it('rejects unsafe identifiers before network', async () => {
    const fetcher = transport();
    await expect(client(fetcher).get('65', '../other')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires backend credentials and rejects production configuration', () => {
    vi.stubEnv('ACBR_CLIENT_ID', '');
    vi.stubEnv('ACBR_CLIENT_SECRET', '');
    expect(() => acbrClient()).toThrow();
    vi.stubEnv('ACBR_CLIENT_ID', 'configured-id');
    vi.stubEnv('ACBR_CLIENT_SECRET', 'configured-secret');
    vi.stubEnv('ACBR_ENVIRONMENT', 'producao');
    expect(() => acbrClient()).toThrow();
    vi.stubEnv('ACBR_ENVIRONMENT', 'homologacao');
    expect(acbrClient()).toBe(acbrClient());
  });
});

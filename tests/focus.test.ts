import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusClient, focusClient } from '../src/modules/fiscal/focus';

const cnpj = '11222333000181';
const reference = 'sale-1';
const key = '1'.repeat(44);
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const remote = (extra = {}) => ({
  ref: reference,
  cnpj_emitente: cnpj,
  status: 'processando_autorizacao',
  ...extra,
});
function setup(...responses: (Response | Error)[]) {
  const fetcher = vi.fn<typeof fetch>();
  responses.forEach((response) =>
    response instanceof Error
      ? fetcher.mockRejectedValueOnce(response)
      : fetcher.mockResolvedValueOnce(response),
  );
  return {
    fetcher,
    client: new FocusClient({ token: 'private-token', fetch: fetcher }),
  };
}
it('não confirma cancelamento consultado sem chave e protocolo do evento', async () => {
  const missing = setup(json(remote({ status: 'cancelado' })));
  expect((await missing.client.get('65', reference)).status).not.toBe(
    'cancelado',
  );
  const confirmed = setup(
    json(
      remote({
        status: 'cancelado',
        chave_nfe: key,
        protocolo_cancelamento: {
          numero_protocolo: '1'.repeat(17),
          status: '135',
        },
      }),
    ),
  );
  expect((await confirmed.client.get('65', reference)).status).toBe(
    'cancelado',
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('Focus homologation transport', () => {
  it.each([
    { chave_nfe: `NFe${key}` },
    {
      chave_nfe: `NFe${key}`,
      protocolo_nota_fiscal: { numero_protocolo: '999999999999999' },
    },
    { chave_nfe: `NFe${key}`, numero_protocolo: '123456789012345' },
    { numero_protocolo: '123456789012345', status_sefaz: '135' },
    {
      chave_nfe: `NFe${key}`,
      numero_protocolo: '123456789012345',
      status_sefaz: '100',
    },
  ])(
    'preserves unconfirmed cancellation instead of marking the fiscal document cancelled: %j',
    async (evidence) => {
      const { client } = setup(
        json(remote({ status: 'cancelado', ...evidence })),
      );
      expect((await client.get('65', reference)).status).toBe(
        'cancelamento_nao_confirmado',
      );
    },
  );
  it.each([
    {
      chave_nfe: `NFe${key}`,
      numero_protocolo: '123456789012345',
      status_sefaz: '135',
    },
    {
      chave_nfe: `NFe${key}`,
      protocolo_cancelamento: {
        numero_protocolo: '123456789012345',
        status: '135',
      },
    },
  ])(
    'normalizes cancellation only with genuine event proof and a valid document key',
    async (evidence) => {
      const { client } = setup(
        json(remote({ status: 'cancelado', ...evidence })),
      );
      expect((await client.get('65', reference)).status).toBe('cancelado');
    },
  );
  it.each(['55', '65'] as const)(
    'submits model %s with Basic auth and private stable reference',
    async (model) => {
      const { client, fetcher } = setup(json(remote()));
      expect(
        await client.submit(model, {
          ambiente: 'homologacao',
          referencia: reference,
          cnpj_emitente: cnpj,
          items: [],
        }),
      ).toMatchObject({
        id: reference,
        referencia: reference,
        ambiente: 'homologacao',
        status: 'processando',
      });
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe(
        `https://homologacao.focusnfe.com.br/v2/${model === '55' ? 'nfe' : 'nfce'}?ref=sale-1&completa=1`,
      );
      expect(init).toMatchObject({
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
      });
      expect(new Headers(init?.headers).get('authorization')).toBe(
        `Basic ${Buffer.from('private-token:').toString('base64')}`,
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        cnpj_emitente: cnpj,
        items: [],
      });
    },
  );
  it('normalizes access key and complete authorization protocol without retaining request echoes', async () => {
    const { client } = setup(
      json(
        remote({
          status: 'autorizado',
          chave_nfe: `NFe${key}`,
          protocolo_nota_fiscal: {
            ambiente: '2',
            numero_protocolo: '123456789012345',
            status: '100',
          },
          requisicao_nota_fiscal: { sensitive: true },
        }),
      ),
    );
    expect(await client.get('65', reference)).toMatchObject({
      chave: key,
      autorizacao: { numero_protocolo: '123456789012345' },
    });
    const other = setup(json(remote({ status: 'erro_autorizacao' })));
    expect((await other.client.get('55', reference)).status).toBe('rejeitado');
  });
  it.each([
    { ambiente: 'producao' },
    { ref: 'other' },
    { cnpj_emitente: 'invalid' },
    { protocolo_nota_fiscal: { ambiente: '1' } },
  ])(
    'rejects inconsistent remote identity or environment %j',
    async (extra) => {
      await expect(
        setup(json(remote(extra))).client.get('65', reference),
      ).rejects.toThrow();
    },
  );
  it('returns null only for explicit missing-reference errors', async () => {
    expect(
      await setup(json({ codigo: 'nao_encontrado' }, 404)).client.find(
        '55',
        cnpj,
        reference,
      ),
    ).toBeNull();
    for (const response of [
      json({}, 404),
      json({ codigo: 'nao_encontrado' }, 401),
      json({ codigo: 'nao_encontrado' }, 500),
    ]) {
      await expect(
        setup(response).client.find('55', cnpj, reference),
      ).rejects.toThrow();
    }
    await expect(
      setup(json(remote({ cnpj_emitente: '12345678000195' }))).client.find(
        '65',
        cnpj,
        reference,
      ),
    ).rejects.toThrow();
  });
  it('uses DELETE and confirms cancellation only with a genuine event protocol', async () => {
    const { client, fetcher } = setup(
      json({
        status: 'cancelado',
        chave_nfe: `NFe${key}`,
        status_sefaz: '135',
        numero_protocolo: '123456789012345',
      }),
    );
    expect(
      await client.cancel(
        '65',
        reference,
        'Cancelamento solicitado pelo comprador',
      ),
    ).toMatchObject({
      id: '123456789012345',
      status: 'registrado',
      numero_protocolo: '123456789012345',
      chave_acesso: key,
    });
    expect(fetcher.mock.calls[0][1]?.method).toBe('DELETE');
    expect(
      await setup(json({ status: 'cancelado' })).client.cancel(
        '65',
        reference,
        'Cancelamento solicitado pelo comprador',
      ),
    ).toMatchObject({ id: '', status: 'pendente' });
  });
  it('reconciles cancellation via full consultation and does not confuse authorization protocol', async () => {
    expect(
      await setup(
        json(
          remote({
            status: 'cancelado',
            numero_protocolo: '123456789012345',
            protocolo_nota_fiscal: { numero_protocolo: '999999999999999' },
          }),
        ),
      ).client.getCancellation('65', reference),
    ).toMatchObject({ id: '123456789012345', status: 'registrado' });
    expect(
      await setup(
        json(
          remote({ status: 'autorizado', numero_protocolo: '999999999999999' }),
        ),
      ).client.getCancellation('65', reference),
    ).toMatchObject({ id: '', status: 'pendente' });
  });
  it.each(['55', '65'] as const)(
    'downloads XML and correct printable bytes for model %s',
    async (model) => {
      const xml = `/arquivos_development/${cnpj}/202611/XMLs/${key}-nfe.xml`;
      const danfe =
        model === '65'
          ? `/notas_fiscais_consumidor/NFe${key}.html`
          : `/arquivos_development/${cnpj}/202611/DANFEs/${key}.pdf`;
      const { client, fetcher } = setup(
        json(remote({ caminho_xml_nota_fiscal: xml, caminho_danfe: danfe })),
        new Response('<nfe/>', {
          headers: { 'Content-Type': 'application/xml' },
        }),
        json(remote({ caminho_danfe: danfe })),
        new Response(model === '65' ? '<html>Danfe</html>' : '%PDF', {
          headers: {
            'Content-Type': model === '65' ? 'text/html' : 'application/pdf',
          },
        }),
      );
      expect(
        new TextDecoder().decode(
          await client.download(model, reference, 'xml'),
        ),
      ).toBe('<nfe/>');
      expect(
        new TextDecoder().decode(
          await client.download(model, reference, 'pdf'),
        ),
      ).toBe(model === '65' ? '<html>Danfe</html>' : '%PDF');
      expect(fetcher.mock.calls[1][0]).toBe(
        `https://homologacao.focusnfe.com.br${xml}`,
      );
    },
  );
  it.each([
    'https://evil.test/file.xml',
    '//evil.test/file.xml',
    '/v2/empresas',
    '/arquivos_development/../v2/empresas.xml',
    '/arquivos_development/%2e%2e/file.xml',
  ])(
    'rejects unsafe remote artifact URL %s without sending credentials',
    async (path) => {
      const { client, fetcher } = setup(
        json(remote({ caminho_xml_nota_fiscal: path })),
      );
      await expect(client.download('65', reference, 'xml')).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('downloads cancellation XML only from provider-declared event path', async () => {
    const path = `/arquivos_development/${cnpj}/202611/XMLs/${key}-can.xml`;
    const { client } = setup(
      json(remote({ status: 'cancelado', caminho_xml_cancelamento: path })),
      new Response('<procEventoNFe/>', {
        headers: { 'content-type': 'application/xml' },
      }),
    );
    expect(
      new TextDecoder().decode(
        await client.downloadCancellation('65', reference),
      ),
    ).toBe('<procEventoNFe/>');
  });
  it('rejects artifacts for a different emitter or document', async () => {
    const mismatchEmitter = `/arquivos_development/12345678000195/202611/XMLs/${key}-nfe.xml`;
    const mismatchKey = `/arquivos_development/${cnpj}/202611/XMLs/${'2'.repeat(44)}-nfe.xml`;
    for (const path of [mismatchEmitter, mismatchKey]) {
      const { client, fetcher } = setup(
        json(remote({ chave_nfe: `NFe${key}`, caminho_xml_nota_fiscal: path })),
        new Response('<nfe/>', {
          headers: { 'content-type': 'application/xml' },
        }),
      );
      await expect(client.download('65', reference, 'xml')).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('aborts stalled requests without retries or exposed secrets', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('private-token')),
            ),
          ),
      );
    const result = new FocusClient({ token: 'private-token', fetch: fetcher })
      .get('65', reference)
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(30000);
    expect(String(await result)).not.toContain('private-token');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('never retries mutations or exposes remote body', async () => {
    const { client, fetcher } = setup(json({ message: 'private-token' }, 500));
    await expect(
      client.submit('65', {
        ambiente: 'homologacao',
        referencia: reference,
        cnpj_emitente: cnpj,
      }),
    ).rejects.toThrow(/^Focus:/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid local reference and unsafe environment before network', async () => {
    const { client, fetcher } = setup();
    await expect(client.get('65', '../secret')).rejects.toThrow();
    await expect(
      client.submit('65', {
        ambiente: 'producao',
        referencia: reference,
        cnpj_emitente: cnpj,
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      () => new FocusClient({ token: 'secret', environment: 'producao' }),
    ).toThrow();
    vi.stubEnv('FOCUS_NFE_TOKEN', 'configured-token');
    vi.stubEnv('FOCUS_NFE_ENVIRONMENT', 'producao');
    expect(() => focusClient()).toThrow();
    vi.stubEnv('FOCUS_NFE_ENVIRONMENT', 'homologacao');
    expect(focusClient()).toBe(focusClient());
  });
});

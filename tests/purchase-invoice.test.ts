import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePurchaseInvoice } from '@/modules/purchases/invoice-xml';
import { lookupReceivedInvoice } from '@/modules/purchases/focus-received';
import {
  invoiceBarcode,
  invoiceFixture,
  invoiceRecipient,
} from './fixtures/purchase-invoice';

const { key, xml } = invoiceFixture();

describe('Leitura da NF-e recebida', () => {
  it('extrai os itens e concilia o rateio até o último centavo', () => {
    const invoice = parsePurchaseInvoice(xml, invoiceRecipient, key);
    expect(invoice).toMatchObject({
      accessKey: key,
      supplier: 'Cosméticos & Beleza',
      date: '2026-11-18',
      total: '100.01',
      items: [
        {
          barcode: invoiceBarcode,
          quantity: '3',
          unit: 'UN',
          lineCost: '59.19',
        },
        { barcode: '', quantity: '2', unit: 'CX', lineCost: '40.82' },
      ],
    });
  });

  it('usa os totais com IBS/CBS quando o XML os fornece', () => {
    const expanded = xml
      .replace('<imposto/></det>', '<imposto/><vItem>59.00</vItem></det>')
      .replace(
        '<indTot>1</indTot></prod><imposto/></det><total>',
        '<indTot>1</indTot></prod><imposto/><vItem>42.00</vItem></det><total>',
      )
      .replace(
        '</ICMSTot></total>',
        '</ICMSTot><vNFTot>101.00</vNFTot></total>',
      );
    const invoice = parsePurchaseInvoice(expanded, invoiceRecipient);
    expect(invoice.total).toBe('101.00');
    expect(invoice.items.map((item) => item.lineCost)).toEqual([
      '59.00',
      '42.00',
    ]);
  });

  it.each([
    [xml.replace(invoiceRecipient, '12345678000199'), /destinatário/],
    [xml.replace('<cStat>100', '<cStat>101'), /protocolo de autorização/],
    [xml.replace('<tpAmb>1', '<tpAmb>2'), /produção/],
    [xml.replace('<finNFe>1', '<finNFe>4'), /compra normal/],
    [xml.replace('</nfeProc>', ''), /Não foi possível ler/],
    [
      xml.replace(
        '<nfeProc',
        '<!DOCTYPE nfeProc [<!ENTITY demo "teste">]><nfeProc',
      ),
      /DTD/,
    ],
    ['<resNFe xmlns="http://www.portalfiscal.inf.br/nfe"/>', /XML completo/],
  ])('recusa documento incompatível %#', (invalid, expected) => {
    expect(() => parsePurchaseInvoice(invalid, invoiceRecipient)).toThrow(
      expected,
    );
  });

  it('recusa a nota quando a chave difere do DANFE escaneado', () => {
    expect(() =>
      parsePurchaseInvoice(xml, invoiceRecipient, invoiceFixture(2).key),
    ).toThrow(/chave do XML/);
  });
});

describe('Consulta de NF-e recebida na Focus', () => {
  afterEach(() => vi.unstubAllEnvs());

  const configured = () => {
    vi.stubEnv('FOCUS_RECEIVED_CNPJ', invoiceRecipient);
    vi.stubEnv('FOCUS_RECEIVED_TOKEN', 'token-sintetico');
  };
  const response = (fields = {}) =>
    Response.json({
      chave_nfe: key,
      cnpj_destinatario: invoiceRecipient,
      situacao: 'autorizada',
      nfe_completa: true,
      ...fields,
    });

  it('consulta situação e baixa XML em duas requisições GET com a mesma chave', async () => {
    configured();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(
        new Response(xml, { headers: { 'Content-Type': 'application/xml' } }),
      );
    await expect(
      lookupReceivedInvoice(invoiceRecipient, key, fetcher),
    ).resolves.toBe(xml);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
      ['.json', '.xml'].map(
        (suffix) =>
          'https://api.focusnfe.com.br/v2/nfes_recebidas/' +
          key +
          suffix +
          '?cnpj=' +
          invoiceRecipient,
      ),
    );
    expect(
      fetcher.mock.calls.every(
        ([, options]) =>
          options?.method === undefined && options?.redirect === 'error',
      ),
    ).toBe(true);
  });

  it.each([
    [{ nfe_completa: false }, /só o resumo/],
    [{ situacao: 'cancelada' }, /como autorizada/],
    [{ cnpj_destinatario: '00000000000000' }, /outra empresa/],
  ])(
    'não baixa XML se o retorno não é elegível %#',
    async (fields, message) => {
      configured();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response(fields));
      await expect(
        lookupReceivedInvoice(invoiceRecipient, key, fetcher),
      ).rejects.toThrow(message);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('não reaproveita o token para outra revenda', async () => {
    configured();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      lookupReceivedInvoice('12345678000195', key, fetcher),
    ).rejects.toThrow(/não está configurada/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

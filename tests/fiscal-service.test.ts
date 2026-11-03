import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  prepareFiscal,
  sendFiscal,
  reconcileFiscal,
  cancelFiscal,
  archiveFiscalFiles,
  dispatchCancellation,
  fiscalFileInfo,
} from '@/modules/fiscal/service';
import { pollFiscalRequests } from '@/modules/fiscal/worker';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { buildFiscalTemplate } from '@/modules/fiscal/payload';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
if (enabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
let organizationId: string;
let productId: string;
let number = 100;
const cnpj = '11222333000181';
const actor = () => ({ organizationId, userId: 'TEST-FISCAL' });
const address = {
  xLgr: 'Rua Teste',
  nro: '1',
  xBairro: 'Centro',
  cMun: '3550308',
  xMun: 'São Paulo',
  UF: 'SP',
  CEP: '01001000',
};
async function fixture() {
  const sale = await db.sale.create({
    data: {
      organizationId,
      subtotal: 10,
      discount: 0,
      total: 10,
      costTotal: 4,
      idempotencyKey: crypto.randomUUID(),
      requestHash: 'test',
      items: {
        create: {
          productId,
          productName: 'TEST produto',
          quantity: 1,
          unitPrice: 10,
          unitCost: 4,
          total: 10,
        },
      },
      fiscalDocument: { create: {} },
    },
    include: { items: true, fiscalDocument: true },
  });
  const raw = buildFiscalTemplate(
    {
      id: sale.id,
      subtotal: '10',
      discount: '0',
      total: '10',
      items: [
        {
          productId,
          productName: 'TEST produto',
          quantity: 1,
          unitPrice: '10',
          total: '10',
        },
      ],
    },
    cnpj,
    '65',
  );
  // Classificações estritamente fictícias para transporte simulado; nunca transmitidas.
  const info = raw.infNFe as Record<string, unknown>;
  info.ide = {
    cUF: 35,
    natOp: 'Venda TEST',
    mod: 65,
    serie: 1,
    nNF: ++number,
    dhEmi: '2026-11-02T10:00:00-03:00',
    tpNF: 1,
    idDest: 1,
    cMunFG: '3550308',
    tpImp: 4,
    tpEmis: 1,
    tpAmb: 2,
    finNFe: 1,
    indFinal: 1,
    indPres: 1,
    procEmi: 0,
    verProc: '1.0',
  };
  info.emit = {
    CNPJ: cnpj,
    xNome: 'TEST',
    IE: '123456789',
    CRT: 4,
    enderEmit: address,
  };
  info.det = [
    {
      nItem: 1,
      prod: {
        cProd: productId,
        xProd: 'TEST produto',
        NCM: '33049990',
        CFOP: '5102',
        uCom: 'UN',
        qCom: 1,
        vUnCom: 10,
        vProd: 10,
        vDesc: 0,
        uTrib: 'UN',
        qTrib: 1,
        vUnTrib: 10,
        indTot: 1,
      },
      imposto: {
        ICMS: { ICMSSN102: { orig: 0, CSOSN: '102' } },
        PIS: { PISNT: { CST: '07' } },
        COFINS: { COFINSNT: { CST: '07' } },
      },
    },
  ];
  info.total = {
    ICMSTot: {
      vBC: 0,
      vICMS: 0,
      vICMSDeson: 0,
      vFCP: 0,
      vBCST: 0,
      vST: 0,
      vFCPST: 0,
      vFCPSTRet: 0,
      vProd: 10,
      vFrete: 0,
      vSeg: 0,
      vDesc: 0,
      vII: 0,
      vIPI: 0,
      vIPIDevol: 0,
      vPIS: 0,
      vCOFINS: 0,
      vOutro: 0,
      vNF: 10,
    },
  };
  info.transp = { modFrete: 9 };
  info.pag = { detPag: [{ tPag: '01', vPag: 10 }] };
  return {
    documentId: sale.fiscalDocument!.id,
    model: '65',
    payload: JSON.stringify(raw),
  };
}
function transport(reference: string) {
  const event = {
    id: `event_${crypto.randomUUID()}`,
    ambiente: 'homologacao' as const,
    status: 'pendente',
    chave_acesso: '1'.repeat(44),
  };
  const doc = {
    id: `nfce_${crypto.randomUUID()}`,
    ambiente: 'homologacao' as const,
    referencia: reference,
    status: 'autorizado',
    chave: '1'.repeat(44),
    autorizacao: { numero_protocolo: '1'.repeat(17) },
  };
  return {
    doc,
    submit: vi.fn(async () => doc),
    get: vi.fn(async () => doc),
    find: vi.fn(async () => doc),
    event,
    cancel: vi.fn(async () => event),
    download: vi.fn(async () => new Uint8Array()),
  };
}
describe.skipIf(!enabled)('Persistência fiscal com transporte simulado', () => {
  beforeAll(async () => {
    const org = await db.organization.create({
      data: { cnpj, name: 'TEST FISCAL', ownerName: 'TEST', city: 'São Paulo' },
    });
    organizationId = org.id;
    const product = await db.product.create({
      data: {
        organizationId,
        name: 'TEST produto',
        sku: crypto.randomUUID(),
        referenceCost: 4,
        salePrice: 10,
      },
    });
    productId = product.id;
  });
  afterAll(async () => {
    if (!organizationId) return;
    const where = { organizationId };
    await db.fiscalRequest.deleteMany({ where });
    await db.fiscalDocument.deleteMany({ where });
    await db.saleItem.deleteMany({ where });
    await db.sale.deleteMany({ where });
    await db.product.deleteMany({ where });
    await db.auditLog.deleteMany({ where });
    await db.organization.delete({ where: { id: organizationId } });
    await rm(join(process.cwd(), '.local', 'fiscal', organizationId), {
      recursive: true,
      force: true,
    });
    await db.$disconnect();
  });
  it('persiste conteúdo, impede preparação duplicada e transmite uma única vez', async () => {
    const raw = await fixture();
    const request = await prepareFiscal(actor(), raw);
    await expect(prepareFiscal(actor(), raw)).rejects.toThrow();
    expect(request.provider).toBe('FOCUS');
    expect(request.fiscalNumber).toBeGreaterThan(0);
    const remote = transport(request.reference);
    const results = await Promise.allSettled([
      sendFiscal(actor(), request.id, remote),
      sendFiscal(actor(), request.id, remote),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(remote.submit).toHaveBeenCalledTimes(1);
    expect(
      (await db.fiscalRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe('AUTHORIZED');
  });
  it('timeout mantém resultado incerto, não reenvia e recupera por referência', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    remote.submit.mockRejectedValueOnce(new Error('timeout'));
    await expect(sendFiscal(actor(), request.id, remote)).rejects.toThrow();
    await expect(sendFiscal(actor(), request.id, remote)).rejects.toThrow();
    expect(remote.submit).toHaveBeenCalledTimes(1);
    await reconcileFiscal(actor(), request.id, remote);
    expect(remote.find).toHaveBeenCalledTimes(1);
    expect(
      (await db.fiscalRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe('AUTHORIZED');
  });
  it('isola organizações e bloqueia payload alterado antes da rede', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    await expect(
      sendFiscal(
        { ...actor(), organizationId: crypto.randomUUID() },
        request.id,
        remote,
      ),
    ).rejects.toThrow();
    await db.fiscalRequest.update({
      where: { id: request.id },
      data: { requestHash: 'alterado' },
    });
    await expect(sendFiscal(actor(), request.id, remote)).rejects.toThrow();
    expect(remote.submit).not.toHaveBeenCalled();
  });
  it('não transmite nem consulta registros de outro provedor usando o cliente Focus', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    await db.fiscalRequest.update({
      where: { id: request.id },
      data: { provider: 'ACBR' },
    });
    await expect(sendFiscal(actor(), request.id, remote)).rejects.toThrow(
      /provedor/,
    );
    await expect(reconcileFiscal(actor(), request.id, remote)).rejects.toThrow(
      /provedor/,
    );
    expect(remote.submit).not.toHaveBeenCalled();
    expect(remote.get).not.toHaveBeenCalled();
    expect(remote.find).not.toHaveBeenCalled();
  });
  it('declara DANFC-e Focus como HTML, sem salvá-lo como PDF', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    expect(await fiscalFileInfo(actor(), request.id, 'pdf')).toMatchObject({
      extension: 'html',
      contentType: 'text/html; charset=utf-8',
    });
    expect(await fiscalFileInfo(actor(), request.id, 'xml')).toMatchObject({
      extension: 'xml',
      contentType: 'application/xml',
    });
  });
  it('recusa consulta que tenta trocar a chave de documento já identificado', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    await sendFiscal(actor(), request.id, remote);
    remote.doc.chave = '2'.repeat(44);
    await expect(
      reconcileFiscal(actor(), request.id, remote),
    ).rejects.toThrow();
    expect(
      (await db.fiscalRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .accessKey,
    ).toBe('1'.repeat(44));
  });
  it('cancelamento não duplica POST, não muda a venda e espera confirmação do documento', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    await sendFiscal(actor(), request.id, remote);
    await cancelFiscal(
      actor(),
      request.id,
      'Cancelamento solicitado em teste',
      remote,
    );
    await expect(
      cancelFiscal(
        actor(),
        request.id,
        'Cancelamento solicitado em teste',
        remote,
      ),
    ).rejects.toThrow();
    expect(remote.cancel).toHaveBeenCalledTimes(1);
    expect(
      (await db.fiscalRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe('CANCEL_REQUESTED');
    expect(
      (
        await db.fiscalDocument.findUniqueOrThrow({
          where: { id: request.documentId },
          include: { sale: true },
        })
      ).sale.status,
    ).toBe('CONFIRMED');
  });
  it('resposta atrasada não apaga intenção nem evidência de cancelamento; rejeição do evento libera nova solicitação', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    await sendFiscal(actor(), request.id, remote);
    remote.doc.status = 'processando';
    await cancelFiscal(
      actor(),
      request.id,
      'Cancelamento solicitado em teste',
      remote,
    );
    const pending = await db.fiscalRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(pending.status).toBe('CANCEL_REQUESTED');
    expect(pending.accessKey).toBe('1'.repeat(44));
    expect(pending.cancelReason).toBe('Cancelamento solicitado em teste');
    remote.doc.status = 'autorizado';
    await reconcileFiscal(actor(), request.id, {
      ...remote,
      getCancellation: async () => ({
        id: remote.event.id,
        ambiente: 'homologacao',
        status: 'rejeitado',
        chave_acesso: '1'.repeat(44),
      }),
    });
    expect(
      (await db.fiscalRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe('AUTHORIZED');
  });
  it('correção rejeitada preserva revisão anterior e permite mesma numeração na nova revisão', async () => {
    const raw = await fixture();
    const request = await prepareFiscal(actor(), raw);
    const remote = transport(request.reference);
    remote.doc.status = 'rejeitado';
    await sendFiscal(actor(), request.id, remote);
    const corrected = await prepareFiscal(actor(), raw);
    expect(corrected.id).not.toBe(request.id);
    expect(
      (await db.fiscalRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe('REJECTED');
  });
  it('rejeição direta do DELETE Focus é correlacionada pela tentativa mesmo sem ID de evento', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    await sendFiscal(actor(), request.id, remote);
    remote.event.id = '';
    remote.event.status = 'rejeitado';
    await cancelFiscal(
      actor(),
      request.id,
      'Solicitação de cancelamento rejeitada',
      remote,
    );
    const state = await db.fiscalRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(state.status).toBe('AUTHORIZED');
    expect(state.cancelPhase).toBe('RESPONDED');
    expect(state.cancelAttemptId).not.toBeNull();
    expect(
      (
        await db.fiscalDocument.findUniqueOrThrow({
          where: { id: request.documentId },
        })
      ).status,
    ).toBe('AUTHORIZED');
  });
  it('rejeição de evento anterior não libera outra tentativa de cancelamento', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    await sendFiscal(actor(), request.id, remote);
    const firstEventId = remote.event.id;
    const client = {
      ...remote,
      getCancellation: async () => ({
        id: firstEventId,
        ambiente: 'homologacao' as const,
        status: 'rejeitado' as const,
        chave_acesso: '1'.repeat(44),
      }),
    };
    await cancelFiscal(
      actor(),
      request.id,
      'Primeira solicitação de cancelamento',
      client,
    );
    expect(
      (await db.fiscalRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe('AUTHORIZED');
    remote.event.id = `event_${crypto.randomUUID()}`;
    await cancelFiscal(
      actor(),
      request.id,
      'Segunda solicitação de cancelamento',
      client,
    );
    expect(
      (await db.fiscalRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe('CANCEL_REQUESTED');
    await expect(
      cancelFiscal(
        actor(),
        request.id,
        'Terceira solicitação de cancelamento',
        client,
      ),
    ).rejects.toThrow();
    expect(remote.cancel).toHaveBeenCalledTimes(2);
  });
  it('retoma cancelamento preparado antes da rede, sem repetir o POST após transmissão', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    await sendFiscal(actor(), request.id, remote);
    await db.fiscalRequest.update({
      where: { id: request.id },
      data: {
        status: 'CANCEL_REQUESTED',
        cancelReason: 'Teste de retomada antes da rede',
        cancelAttemptId: crypto.randomUUID(),
        cancelPhase: 'PREPARED',
      },
    });
    await db.fiscalDocument.update({
      where: { id: request.documentId },
      data: { status: 'CANCEL_REQUESTED' },
    });
    await dispatchCancellation(actor(), request.id, remote);
    await expect(
      dispatchCancellation(actor(), request.id, remote),
    ).rejects.toThrow();
    expect(remote.cancel).toHaveBeenCalledTimes(1);
  });
  it('arquiva arquivos autorizados localmente sem depender de download manual', async () => {
    const request = await prepareFiscal(actor(), await fixture());
    const remote = transport(request.reference);
    await sendFiscal(actor(), request.id, remote);
    await archiveFiscalFiles(actor(), request.id, remote);
    await archiveFiscalFiles(actor(), request.id, remote);
    expect(remote.download).toHaveBeenCalledTimes(2);
    const archived = await db.fiscalRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(archived.xmlArchivedAt).not.toBeNull();
    expect(archived.pdfArchivedAt).not.toBeNull();
  });
  it('consultas que falham não impedem agendamento dos documentos seguintes', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) {
      const request = await prepareFiscal(actor(), await fixture());
      ids.push(request.id);
      await db.fiscalRequest.update({
        where: { id: request.id },
        data: { status: 'UNKNOWN', nextPollAt: new Date(2000, 0, i + 1) },
      });
    }
    const remote = transport('none');
    remote.find.mockRejectedValue(new Error('offline'));
    await pollFiscalRequests(remote);
    await pollFiscalRequests(remote);
    const pending = await db.fiscalRequest.findMany({
      where: { id: { in: ids } },
    });
    expect(pending.every((r) => r.nextPollAt > new Date())).toBe(true);
    expect(remote.submit).not.toHaveBeenCalled();
  });
});

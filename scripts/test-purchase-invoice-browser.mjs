import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zxing from '@zxing/library';
import { invoiceFixture } from '../tests/fixtures/purchase-invoice.ts';

/**
 * Vídeo falso para a câmera do Chromium: um QR Code com a chave da nota,
 * para validar a leitura pela câmera de ponta a ponta, sem rede.
 */
async function fakeCameraVideo(text) {
  const size = 480;
  const matrix = new zxing.MultiFormatWriter().encode(
    text,
    zxing.BarcodeFormat.QR_CODE,
    360,
    360,
    new Map(),
  );
  const offset = (size - matrix.getWidth()) / 2;
  const luma = Buffer.alloc(size * size, 255);
  for (let y = 0; y < matrix.getHeight(); y++)
    for (let x = 0; x < matrix.getWidth(); x++)
      if (matrix.get(x, y)) luma[(y + offset) * size + x + offset] = 0;
  const chroma = Buffer.alloc((size / 2) * (size / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma]);
  const file = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'nfe-camera-')),
    'qr.y4m',
  );
  await fs.writeFile(
    file,
    Buffer.concat([
      Buffer.from(`YUV4MPEG2 W${size} H${size} F10:1 Ip A1:1 C420jpeg\n`),
      ...Array(10).fill(frame),
    ]),
  );
  return file;
}
const cameraKey = invoiceFixture().key;
const cameraVideo = await fakeCameraVideo(
  `https://www.nfe.fazenda.gov.br/portal/consulta.aspx?chNFe=${cameraKey}`,
);

const bundle = await build({
  stdin: {
    contents:
      "import React from 'react'; import {createRoot} from 'react-dom/client'; import {PurchaseInvoiceForm} from './src/modules/purchases/invoice-form'; import {ProductForm} from './src/modules/products/product-form'; import {ActionDialog} from './src/components/action-dialog'; import {invoiceFixture} from './tests/fixtures/purchase-invoice'; window.data=invoiceFixture(); createRoot(document.getElementById('root')).render(<><ActionDialog title='Receber mercadorias' trigger='Receber mercadorias'><PurchaseInvoiceForm focusEnabled={!location.search.includes('local')} /></ActionDialog><ProductForm /></>);",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'stub-server',
      setup(api) {
        api.onResolve(
          { filter: /^(\.\/invoice-actions|@\/app\/actions)$/ },
          ({ path }) => ({ path, namespace: 'stub' }),
        );
        api.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
          loader: 'js',
          contents: path.endsWith('/actions')
            ? 'export async function operationAction(){window.productSubmitted=true;return {ok:true}}'
            : `
      export async function loadPurchaseInvoice(source, value, expectedKey){
        window.loadedInvoice={source,value,expectedKey};
        return {ok:true,xml:window.data.xml,draft:{supplier:'Fornecedor teste',accessKey:window.data.key,date:'2026-11-18',total:'100.01',allocations:true,products:[{id:'perfume',name:'Perfume',sku:'P1'}],items:[{line:1,name:'Perfume',unit:'UN',barcode:'7894900011517',code:'P1',quantity:'3',lineCost:'59.19',matchedProductId:'perfume',unitsPerPackage:1},{line:2,name:'Sabonete',unit:'CX',barcode:'',code:'S1',quantity:'2',lineCost:'40.82',matchedProductId:'',unitsPerPackage:null}]}};
      }
      export async function registerPurchaseInvoice(payload){window.submission=payload;return {ok:true,message:'Compra registrada e estoque atualizado.'}}
      export async function searchPurchaseProducts(){return []}
      export async function checkPurchaseInvoiceKey(key){window.checkedKey=key;return {ok:true}}
    `,
        }));
      },
    },
  ],
});
const browser = await chromium.launch({
  channel: process.env.UX_BROWSER_CHANNEL || 'chromium',
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${cameraVideo}`,
  ],
  ...(process.env.UX_BROWSER_EXECUTABLE
    ? { executablePath: process.env.UX_BROWSER_EXECUTABLE }
    : {}),
});
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.route('http://localhost/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const productBarcode = page.getByLabel('Código de barras (opcional)');
    await productBarcode.fill('7894900011517');
    await productBarcode.press('Enter');
    assert.equal(
      await page.getByLabel('Código interno (SKU)').inputValue(),
      '7894900011517',
    );
    assert.equal(await page.evaluate(() => window.productSubmitted), undefined);
    await page.getByRole('button', { name: 'Receber mercadorias' }).click();
    const dialog = page.getByRole('dialog', { name: 'Receber mercadorias' });
    if (width === 1280) {
      const key = await page.evaluate(() => window.data.key);
      const field = page.getByLabel(
        'Chave da nota (código de barras do DANFE)',
      );
      // Chave completa já dispara a busca; o Enter do leitor não é necessário.
      await field.fill(key);
    } else {
      const xml = await page.evaluate(() => window.data.xml);
      await page.getByLabel('Importar XML da NF-e').setInputFiles({
        name: 'compra.xml',
        mimeType: 'text/xml',
        buffer: Buffer.from(xml),
      });
    }
    await page.getByText('Fornecedor teste').waitFor();
    const products = page.getByLabel('Produto no estoque');
    assert.equal(await products.first().inputValue(), 'perfume');
    assert.equal(await page.evaluate(() => window.submission), undefined);
    await products.nth(1).selectOption('new');
    await page.getByLabel('Unidades de estoque por CX').fill('6');
    // Produto novo vem da nota: nome, quantidade e custo (não o preço de revenda).
    assert.equal(
      await dialog.getByLabel('Nome do produto').inputValue(),
      'Sabonete',
    );
    const facts = dialog.locator('.item-facts');
    await facts.getByText('12 un.').waitFor();
    await facts.getByText(/R\$\s*3,40/).waitFor();
    await facts.getByText(/R\$\s*40,82/).waitFor();
    const resale = dialog.getByLabel(
      'Preço de revenda (R$), definido por você',
    );
    assert.equal(await resale.inputValue(), '');
    await resale.fill('9.90');
    await page.getByText('Entrada de 12 un.', { exact: false }).waitFor();
    await page
      .getByRole('button', { name: 'Confirmar entrada no estoque' })
      .click();
    await page.getByText('Compra registrada e estoque atualizado.').waitFor();
    const result = await page.evaluate(() => ({
      source: window.loadedInvoice.source,
      items: window.submission.items,
    }));
    assert.equal(result.source, width === 1280 ? 'key' : 'xml');
    assert.deepEqual(result.items[1], {
      line: 2,
      unitsPerPackage: 6,
      product: { kind: 'new', name: 'Sabonete', salePrice: '9.90' },
    });
    await page.close();
  }

  // Sem Focus: leitor USB (sem Enter) e câmera identificam a nota localmente,
  // e o XML importado em seguida precisa ser da mesma chave.
  for (const via of ['leitor', 'camera']) {
    const page = await browser.newPage({
      viewport: { width: via === 'camera' ? 390 : 1280, height: 800 },
    });
    await page.route('http://localhost/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://localhost/?local');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Receber mercadorias' }).click();
    const key = await page.evaluate(() => window.data.key);
    assert.equal(key, cameraKey);
    if (via === 'leitor') {
      // Leitor de código de barras = teclado digitando rápido, sem Enter.
      await page
        .getByLabel('Chave da nota (código de barras do DANFE)')
        .pressSequentially(key, { delay: 2 });
    } else {
      await page.getByRole('button', { name: 'Ler com a câmera' }).click();
      await page.getByRole('dialog', { name: 'Ler código da nota' }).waitFor();
    }
    await page.getByText('Nota identificada').waitFor({ timeout: 20_000 });
    await page
      .getByText('NF-e nº 1, série 1, emitida em 11/2026 (SP)')
      .waitFor();
    await page.getByText('CNPJ 12.345.678/0001-95').waitFor();
    assert.equal(await page.evaluate(() => window.checkedKey), key);
    const xml = await page.evaluate(() => window.data.xml);
    await page.getByLabel('Agora importe o XML desta nota').setInputFiles({
      name: 'compra.xml',
      mimeType: 'text/xml',
      buffer: Buffer.from(xml),
    });
    await page.getByText('Fornecedor teste').waitFor();
    assert.deepEqual(
      await page.evaluate(() => ({
        source: window.loadedInvoice.source,
        expectedKey: window.loadedInvoice.expectedKey,
      })),
      { source: 'xml', expectedKey: key },
    );
    await page.close();
  }
  console.log(
    'Chromium: leitor, câmera (QR), XML, conferência da chave e confirmação validados em desktop e celular, com e sem Focus.',
  );
} finally {
  await browser.close();
}

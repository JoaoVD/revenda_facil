import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const bundle = await build({
  stdin: {
    contents:
      "import React from 'react'; import {createRoot} from 'react-dom/client'; import {PurchaseInvoiceForm} from './src/modules/purchases/invoice-form'; import {ProductForm} from './src/modules/products/product-form'; import {ActionDialog} from './src/components/action-dialog'; import {invoiceFixture} from './tests/fixtures/purchase-invoice'; window.data=invoiceFixture(); createRoot(document.getElementById('root')).render(<><ActionDialog title='Receber mercadorias' trigger='Receber mercadorias'><PurchaseInvoiceForm focusEnabled /></ActionDialog><ProductForm /></>);",
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
      export async function loadPurchaseInvoice(source, value){
        window.loadedInvoice={source,value};
        return {ok:true,xml:window.data.xml,draft:{supplier:'Fornecedor teste',accessKey:window.data.key,date:'2026-11-18',total:'100.01',allocations:true,products:[{id:'perfume',name:'Perfume',sku:'P1'}],items:[{line:1,name:'Perfume',unit:'UN',barcode:'7894900011517',code:'P1',quantity:'3',lineCost:'59.19',matchedProductId:'perfume',unitsPerPackage:1},{line:2,name:'Sabonete',unit:'CX',barcode:'',code:'S1',quantity:'2',lineCost:'40.82',matchedProductId:'',unitsPerPackage:null}]}};
      }
      export async function registerPurchaseInvoice(payload){window.submission=payload;return {ok:true,message:'Compra registrada e estoque atualizado.'}}
      export async function searchPurchaseProducts(){return []}
    `,
        }));
      },
    },
  ],
});
const browser = await chromium.launch({
  channel: process.env.UX_BROWSER_CHANNEL || 'chromium',
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
      const field = page.getByLabel('Escanear código do DANFE');
      await field.fill(key);
      await field.press('Enter');
    } else {
      const xml = await page.evaluate(() => window.data.xml);
      await page
        .getByLabel('Importar XML da NF-e')
        .setInputFiles({
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
    await dialog
      .getByLabel('Preço de venda (R$)', { exact: true })
      .fill('9.90');
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
  console.log(
    'Chromium: leitor, XML, conferência e confirmação validados em desktop e celular.',
  );
} finally {
  await browser.close();
}

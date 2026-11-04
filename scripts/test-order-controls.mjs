// Componentes reais; fronteira servidor/autenticação simulada, sem alterações comerciais reais.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const productId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
const saleId = '33333333-3333-4333-8333-333333333333';
const bundle = await build({
  stdin: {
    loader: 'tsx',
    resolveDir: process.cwd(),
    contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {EditOrderForm} from './src/modules/orders/edit-form'; import {RefundForm} from './src/modules/orders/refund-form'; import {ResolutionForm} from './src/modules/sync/resolution-form';
    const root=createRoot(document.getElementById('root'));
    window.showEdit=()=>root.render(<EditOrderForm order={{id:'${saleId}',version:1,customerId:'${customerId}',fulfillmentMode:'PICKUP',address:'Rua TEST',expectedDate:'',deliveryNotes:'Avisar antes',agreementNotes:'Pagar depois',discount:'0',received:'80',items:[{productId:'${productId}',quantity:2,price:'100',name:'Perfume TEST'}],installments:[]}} products={[]} customers={[{id:'${customerId}',name:'Cliente TEST'}]} />);
    window.showRefund=()=>root.render(<RefundForm saleId='${saleId}' version={1} received='80' delivered={true} />);
    window.showResolution=()=>root.render(<ResolutionForm review={{id:'${saleId}',type:'ORDER',status:'ATTENTION',message:'Preço alterado',revision:0,capturedAt:'2026-11-04T12:00:00Z',originalAmount:'180',currentTotal:'200',paid:'80',items:[{name:'Perfume TEST',quantity:2,available:10,price:'100'}],installments:[],blockedBy:[]}} />);
  `,
  },
  bundle: true,
  write: false,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'boundary',
      setup(api) {
        api.onResolve(
          { filter: /^(next\/navigation|next\/link|@\/app\/actions)$/ },
          (args) => ({ path: args.path, namespace: 'stub' }),
        );
        api.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
          loader: 'js',
          resolveDir: process.cwd(),
          contents:
            args.path === 'next/navigation'
              ? `export const useRouter=()=>({push(){},refresh(){}});`
              : args.path === 'next/link'
                ? `import React from 'react'; export default function Link(props){return React.createElement('a',props);}`
                : `export async function operationAction(type,payload){window.calls=(window.calls||[]).concat({type,payload});if(window.fail)throw new Error('Response lost');return {ok:false,message:'Servidor simulado: revise o pedido.'};}`,
        }));
      },
    },
  ],
});
const browser = await chromium.launch({
  channel: process.env.UX_BROWSER_CHANNEL || 'chrome',
});
const context = await browser.newContext();
await context.route('http://localhost/**', (r) =>
  r.fulfill({
    contentType: 'text/html',
    body: '<html lang="pt-BR"><body><main id="root" style="padding:16px;max-width:1000px;margin:auto"></main></body></html>',
  }),
);
try {
  await fs.mkdir('artifacts/orders', { recursive: true });
  for (const width of [1366, 320, 390, 430, 740]) {
    for (const type of ['Edit', 'Refund', 'Resolution']) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.goto('http://localhost/');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.addStyleTag({
        content: (await fs.readFile('src/app/globals.css', 'utf8')).replace(
          /@import[^;]+;/g,
          '',
        ),
      });
      await page.evaluate((type) => window[`show${type}`](), type);
      const button = page.getByRole('button', {
        name:
          type === 'Edit'
            ? 'Salvar alterações do pedido'
            : type === 'Refund'
              ? 'Registrar reembolso e cancelar pedido'
              : 'Confirmar conferência',
        exact: true,
      });
      await button.waitFor();
      if (width <= 760) {
        const dimensions = await page
          .locator('input:not([type="checkbox"])')
          .first()
          .evaluate((input) => ({
            height: input.getBoundingClientRect().height,
            font: parseFloat(getComputedStyle(input).fontSize),
          }));
        assert(
          dimensions.height >= 48,
          'Campo com altura confortável para toque',
        );
        assert(dimensions.font >= 16, 'Texto legível sem zoom ao focar');
      }
      assert.equal(await page.evaluate(() => window.calls?.length || 0), 0);
      if (type === 'Edit') {
        await page.getByLabel('Quantidade de Perfume TEST').fill('3');
        await page
          .getByLabel('Motivo da alteração')
          .fill('Cliente pediu mais uma unidade');
        await button.click();
        assert.equal(await page.evaluate(() => window.calls?.length || 0), 0);
        await page.getByRole('checkbox').check();
        await page.evaluate(() => {
          window.fail = true;
        });
        await button.click();
        await page
          .getByRole('status')
          .filter({ hasText: 'Não foi possível confirmar' })
          .waitFor();
        assert.equal(
          await page.getByLabel('Quantidade de Perfume TEST').inputValue(),
          '3',
        );
        const first = await page.evaluate(() => window.calls[0]);
        assert.equal(first.type, 'edit-order');
        assert.equal(first.payload.expectedTotal, '300.00');
        await page.evaluate(() => {
          window.fail = false;
        });
        await button.click();
        await page.waitForFunction(() => window.calls.length === 2);
        assert.deepEqual(await page.evaluate(() => window.calls[1]), first);
      } else if (type === 'Refund') {
        await page
          .getByLabel('Motivo do cancelamento e reembolso')
          .fill('Devolução integral conferida');
        await page.getByLabel(/Confirmei a devolução integral/).check();
        await button.click();
        assert.equal(await page.evaluate(() => window.calls?.length || 0), 0);
        await page.getByLabel(/Todos os produtos/).check();
        await button.click();
        await page.waitForFunction(() => window.calls?.length === 1);
        const call = await page.evaluate(() => window.calls[0]);
        assert.equal(call.type, 'refund-cancel');
        assert.equal(call.payload.amount, '80');
        assert.equal(call.payload.itemsReturned, true);
        assert.equal(call.payload.confirmed, true);
      } else {
        await page.getByLabel('Como resolver').selectOption('ORDER_PRICES');
        await page
          .getByLabel('O que foi conferido?')
          .fill('Novo preço confirmado pela cliente');
        await button.click();
        assert.equal(await page.evaluate(() => window.calls?.length || 0), 0);
        await page.getByRole('checkbox').check();
        await button.click();
        await page.waitForFunction(() => window.calls?.length === 1);
        const call = await page.evaluate(() => window.calls[0]);
        assert.equal(call.type, 'resolve-sync');
        assert.equal(call.payload.action, 'ORDER_PRICES');
        assert.equal(call.payload.expectedTotal, '200');
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: `artifacts/orders/${type.toLowerCase()}-${width}.png`,
        fullPage: true,
      });
      await page.close();
    }
  }
  console.log(
    'PASS: desktop/mobile edição, confirmação explícita, erro de transporte preserva dados/chave, reembolso exige retorno físico, conferência de preços sem ação automática e sem overflow. HTTP simulado.',
  );
} finally {
  await context.close();
  await browser.close();
}

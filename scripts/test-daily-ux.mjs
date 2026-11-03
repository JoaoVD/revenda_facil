import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const stubs = {
  'next/navigation': `export const useRouter=()=>({refresh(){}}); export const usePathname=()=>'/clientes';`,
  '@/app/actions': `export async function operationAction(){window.__actionCount=(window.__actionCount||0)+1; throw Error('Server actions are outside this UI test');} export async function logoutAction(){}`,
  'next/link': `import React from 'react'; export default function Link({href,children,...props}) {return <a href={href} {...props}>{children}</a>;}`,
};
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ActionDialog} from './src/components/action-dialog'; import {ViewTabs} from './src/components/view-tabs'; import {SalesTerminal} from './src/modules/sales/sales-terminal'; import {Navigation} from './src/components/navigation'; import {OperationForm} from './src/components/operation-form'; import {PaymentForm} from './src/modules/finance/payment-form'; createRoot(document.getElementById('root')).render(<><Navigation name="Loja" owner="Ana" /><main className="workspace"><ActionDialog title="Novo cadastro" trigger="Novo cadastro"><form><label>Nome<input name="name" /></label><button>Salvar</button></form></ActionDialog><ViewTabs primaryLabel="Nova venda" secondaryLabel="Historico" primary={<SalesTerminal products={[{id:'p1',name:'Perfume',sku:'P1',barcode:null,brand:'Marca',stock:10,salePrice:'100',referenceCost:'40'}]} customers={[]} />} secondary={<p>Vendas registradas</p>} /><OperationForm operation="test" button="Preparar teste" transform={()=>{throw Error('Revise os dados antes de preparar');}}><label>Campo de teste<input name="test" /></label></OperationForm>{['SALE','PURCHASE','EXPENSE'].map(kind=><ActionDialog key={kind} title={kind} trigger={kind}><PaymentForm initialKind={kind} sales={[{id:'s1',label:'Venda 1'}]} purchases={[{id:'c1',label:'Compra 1'}]} /></ActionDialog>)}</main></>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'ui-only-server-boundaries',
      setup(api) {
        api.onResolve(
          { filter: /^(next\/navigation|next\/link|@\/app\/actions)$/ },
          (args) => ({ path: args.path, namespace: 'ui-stub' }),
        );
        api.onLoad({ filter: /.*/, namespace: 'ui-stub' }, (args) => ({
          contents: stubs[args.path],
          loader: 'tsx',
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const browser = await chromium.launch({
  channel: process.env.UX_BROWSER_CHANNEL || 'chrome',
});
try {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.route('http://localhost/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"></div>',
      }),
    );
    await page.goto('http://localhost/');
    await page.addStyleTag({
      content: (await fs.readFile('src/app/globals.css', 'utf8')).replace(
        /@import[^;]+;/g,
        '',
      ),
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    if (viewport.width === 390)
      await page.getByRole('button', { name: 'Mais', exact: true }).click();
    const group = page.locator('.ux-nav-group');
    assert.equal(await group.getAttribute('open'), null);
    assert.equal(
      await page
        .locator('.sidebar')
        .getByRole('link', { name: 'Clientes', exact: true })
        .getAttribute('aria-current'),
      'page',
    );
    await group.locator('summary').click();
    assert.equal(await group.getAttribute('open'), '');
    await group.locator('summary').click();
    if (viewport.width === 390) await page.locator('.mobile-menu').click();
    const trigger = page.getByRole('button', {
      name: 'Novo cadastro',
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Novo cadastro' });
    await dialog.waitFor({ state: 'visible' });
    assert.equal(
      await page
        .getByLabel('Nome')
        .evaluate((el) => el === document.activeElement),
      true,
    );
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      assert.equal(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
        true,
      );
    }
    await page.getByLabel('Nome').fill('Em andamento');
    page.once('dialog', (d) => d.dismiss());
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), true);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(
      await trigger.evaluate((el) => el === document.activeElement),
      true,
    );
    await trigger.click();
    assert.equal(await page.getByLabel('Nome').inputValue(), '');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page
      .getByRole('button')
      .filter({ hasText: 'Perfume' })
      .filter({ hasText: 'Adicionar' })
      .click();
    assert.equal(await page.locator('.cart-item').count(), 1);
    await fs.mkdir('artifacts/daily-ux', { recursive: true });
    await page.screenshot({
      path: `artifacts/daily-ux/cart-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole('tab', { name: 'Historico', exact: true }).click();
    assert.equal(await page.locator('.cart-item').isVisible(), false);
    await page.getByRole('tab', { name: 'Nova venda', exact: true }).click();
    assert.equal(await page.locator('.cart-item').count(), 1);
    assert.equal(
      await page.locator('.cart-item .quantity > span').textContent(),
      '1',
    );
    await page.getByRole('tab', { name: 'Nova venda', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page
        .getByRole('tab', { name: 'Historico', exact: true })
        .getAttribute('aria-selected'),
      'true',
    );

    await page.getByLabel('Campo de teste').fill('Manter digitado');
    await page
      .getByRole('button', { name: 'Preparar teste', exact: true })
      .click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Revise os dados antes de preparar' })
      .waitFor({ state: 'visible' });
    assert.equal(
      await page.getByLabel('Campo de teste').inputValue(),
      'Manter digitado',
    );
    assert.equal(await page.evaluate(() => window.__actionCount || 0), 0);
    for (const kind of ['SALE', 'PURCHASE', 'EXPENSE']) {
      await page.getByRole('button', { name: kind, exact: true }).click();
      const modal = page.getByRole('dialog', { name: kind, exact: true });
      assert.equal(await modal.locator('select[name="kind"]').count(), 0);
      assert.equal(
        await modal.locator('input[name="kind"]').inputValue(),
        kind,
      );
      assert.equal(
        await modal.locator('select[name="referenceId"]').count(),
        kind === 'EXPENSE' ? 0 : 1,
      );
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden' });
    }
    if (viewport.width === 1280) {
      await page
        .getByRole('button', { name: 'Novo cadastro', exact: true })
        .click();
      await fs.mkdir('artifacts/daily-ux', { recursive: true });
      await page.screenshot({ path: 'artifacts/daily-ux/dialog-desktop.png' });
      await page.keyboard.press('Escape');
    }
    await page.close();
  }
  console.log(
    'Desktop/mobile: full module navigation, secondary shortcuts, dialog focus/trap, Escape, discard guard, return focus, discarded form reset, real cart persistence keyboard tabs, per-action finance fields and transform error preservation passed.',
  );
} finally {
  await browser.close();
}

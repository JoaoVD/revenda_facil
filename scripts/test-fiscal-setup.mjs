import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const bundle = await build({
  stdin: {
    contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {FiscalProductForm} from './src/modules/fiscal/configuration-forms';
createRoot(document.getElementById('root')).render(<FiscalProductForm products={[{id:'11111111-1111-4111-8111-111111111111',name:'Produto de teste',profile:null}]} />);
`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  plugins: [
    {
      name: 'test-boundaries',
      setup(build) {
        build.onResolve(
          { filter: /^(next\/navigation|@\/app\/actions)$/ },
          (args) => ({ path: args.path, namespace: 'test-boundary' }),
        );
        build.onLoad({ filter: /.*/, namespace: 'test-boundary' }, (args) => ({
          loader: 'js',
          contents:
            args.path === 'next/navigation'
              ? `export const useRouter=()=>({refresh(){}});`
              : `export async function operationAction(operation,data){window.saved={operation,data};return {ok:true,message:'Cadastro fiscal salvo para teste'};}`,
        }));
      },
    },
  ],
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) =>
      console.error('fiscal_setup_browser_error', error.message),
    );
    await page.setContent(
      '<!doctype html><html><body><div id="root"></div></body></html>',
    );
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page
      .getByLabel('Produto para configurar', { exact: false })
      .selectOption('11111111-1111-4111-8111-111111111111');
    assert.equal(await page.locator('textarea:visible').count(), 0);
    assert.equal(
      await page
        .getByLabel('Origem da mercadoria', { exact: false })
        .inputValue(),
      '',
    );
    await page.getByLabel('NCM (8 dígitos)', { exact: true }).fill('33049990');
    await page.getByLabel('CFOP (4 dígitos)', { exact: true }).fill('5102');
    await page.getByLabel('Unidade comercial', { exact: true }).fill('UN');
    await page.getByLabel('Unidade tributável', { exact: true }).fill('UN');
    await page
      .getByLabel('Origem da mercadoria', { exact: false })
      .selectOption('0');
    await page
      .getByLabel('Situação tributária ICMS (CSOSN)', { exact: false })
      .selectOption('102');
    await page
      .getByLabel('Situação tributária PIS', { exact: false })
      .selectOption('07');
    await page
      .getByLabel('Situação tributária COFINS', { exact: false })
      .selectOption('07');
    await page
      .getByRole('button', {
        name: 'Salvar dados fiscais do produto',
        exact: true,
      })
      .click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Cadastro fiscal salvo para teste' })
      .waitFor();
    const saved = await page.evaluate(() => window.saved);
    assert.equal(saved.operation, 'fiscal-product');
    assert.deepEqual(JSON.parse(saved.data.imposto), {
      ICMS: { ICMSSN102: { orig: 0, CSOSN: '102' } },
      PIS: { PISNT: { CST: '07' } },
      COFINS: { COFINSNT: { CST: '07' } },
    });
    assert.equal(await page.locator('textarea:visible').count(), 0);
    await page.close();
  }
  console.log(
    'Desktop/mobile: cadastro fiscal por campos, sem tributação predefinida nem edição JSON, passou. Ação de servidor simulada; sem gravação real.',
  );
} finally {
  await browser.close();
}

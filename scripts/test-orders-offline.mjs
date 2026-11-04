// Componentes reais + IndexedDB real no Chrome. HTTP/autenticação simulados.
// Não substitui E2E autenticado nem concorrência PostgreSQL multissessão.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import * as store from './src/modules/sync/local-store'; import {synchronize} from './src/modules/sync/client'; import {OrderWizard} from './src/modules/orders/order-wizard'; import * as drafts from './src/modules/orders/draft-store'; window.drafts=drafts; window.store=store; window.synchronize=synchronize; window.renderWizard=(scope,price='90')=>createRoot(document.getElementById('root')).render(<OrderWizard scope={scope} products={[{id:'11111111-1111-4111-8111-111111111111',name:'Perfume de teste',sku:'TEST',stock:10,salePrice:price,referenceCost:'40',barcode:null,brand:'TEST'}]} customers={[{id:'22222222-2222-4222-8222-222222222222',name:'Cliente TEST'}]} />);`,
    loader: 'tsx',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'server-boundary',
      setup(api) {
        api.onResolve(
          { filter: /^(next\/navigation|next\/image|@\/app\/actions)$/ },
          (args) => ({ path: args.path, namespace: 'stub' }),
        );
        api.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
          contents:
            args.path === 'next/navigation'
              ? `export const useRouter=()=>({push(path){window.lastRoute=path},refresh(){}});`
              : args.path === 'next/image'
                ? `import React from 'react'; export default function Image({unoptimized,...props}){return React.createElement('img',props);}`
                : `export async function operationAction(type,payload){window.lastPayload=payload;window.actionCalls=(window.actionCalls||[]).concat({type,payload});if(window.failTransport)throw new Error('Response lost');if(window.actionResult)return window.actionResult;return {ok:false,message:'Servidor simulado: confira os dados.'};}`,
          loader: 'js',
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const browser = await chromium.launch({
  channel: process.env.UX_BROWSER_CHANNEL || 'chrome',
});
const context = await browser.newContext();
await context.route('http://localhost/**', (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: '<html lang="pt-BR"><div id="root"></div></html>',
  }),
);
const bootstrap = async (page) => {
  await page.goto('http://localhost/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
};
try {
  const page = await context.newPage();
  await bootstrap(page);
  await page.evaluate(async () => {
    const scope = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    const snapshot = {
      ...scope,
      owner: 'TEST',
      serverAt: new Date().toISOString(),
      products: [],
      customers: [],
      sales: [],
      conflicts: [],
    };
    await window.store.saveSnapshot(snapshot);
    const order = {
      ...scope,
      id: crypto.randomUUID(),
      contractVersion: 1,
      type: 'ORDER',
      capturedAt: new Date().toISOString(),
      dependencies: [],
      payload: { orderId: crypto.randomUUID() },
    };
    const receipt = {
      ...scope,
      id: crypto.randomUUID(),
      contractVersion: 1,
      type: 'PAYMENT',
      capturedAt: new Date(Date.now() + 1).toISOString(),
      dependencies: [order.id],
      payload: { amount: '60' },
    };
    await window.store.enqueue(order);
    await window.store.enqueue(receipt);
    window.testScope = scope;
    window.testSnapshot = snapshot;
  });
  const scope = await page.evaluate(() => window.testScope),
    snapshot = await page.evaluate(() => window.testSnapshot);
  await page.reload();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  assert.equal(
    await page.evaluate(
      async (s) => (await window.store.localCommands(s)).length,
      scope,
    ),
    2,
  );
  assert.equal(
    await page.evaluate(
      async (s) =>
        (
          await window.store.localCommands({
            ...s,
            userId: crypto.randomUUID(),
          })
        ).length,
      scope,
    ),
    0,
  );
  assert.equal(
    await page.evaluate(async (s) => {
      const command = (await window.store.localCommands(s))[0];
      try {
        await window.store.enqueue({ ...command, payload: { changed: true } });
        return false;
      } catch {
        return (await window.store.localCommands(s)).length === 2;
      }
    }, scope),
    true,
  );
  const second = await context.newPage();
  await bootstrap(second);
  const leases = await Promise.all([
    page.evaluate((s) => window.store.acquireLease(s, 'tab-1'), scope),
    second.evaluate((s) => window.store.acquireLease(s, 'tab-2'), scope),
  ]);
  assert.equal(leases.filter(Boolean).length, 1);
  await page.evaluate((s) => window.store.releaseLease(s, 'tab-1'), scope);
  await second.evaluate((s) => window.store.releaseLease(s, 'tab-2'), scope);
  await context.route('http://localhost/api/sync', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );
  assert.match(
    await page.evaluate((s) => window.synchronize(s), scope),
    /Entre novamente/,
  );
  assert.equal(
    await page.evaluate(
      async (s) =>
        (await window.store.localCommands(s)).filter(
          (c) => c.state === 'PENDING',
        ).length,
      scope,
    ),
    2,
  );
  await context.unroute('http://localhost/api/sync');
  await context.route('http://localhost/api/sync', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...snapshot,
        userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    }),
  );
  assert.match(
    await page.evaluate((s) => window.synchronize(s), scope),
    /Conta diferente/,
  );
  assert.equal(
    await page.evaluate(
      async (s) =>
        (await window.store.localCommands(s)).filter(
          (c) => c.state === 'PENDING',
        ).length,
      scope,
    ),
    2,
  );
  await context.unroute('http://localhost/api/sync');
  const sent = [];
  await context.route('http://localhost/api/sync', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(snapshot),
      });
    const command = route.request().postDataJSON();
    sent.push(command.type);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: command.id,
        status: 'APPLIED',
        result: { id: command.id },
      }),
    });
  });
  const syncing = await Promise.all([
    page.evaluate((s) => window.synchronize(s), scope),
    second.evaluate((s) => window.synchronize(s), scope),
  ]);
  assert(syncing.includes('Tudo sincronizado'));
  assert.deepEqual(sent, ['ORDER', 'PAYMENT']);
  // Fechar todas as páginas e abrir outra mantém fila/resultado no contexto persistente.
  await page.close();
  await second.close();
  const reopened = await context.newPage();
  await bootstrap(reopened);
  assert.equal(
    await reopened.evaluate(
      async (s) =>
        (await window.store.localCommands(s)).filter(
          (c) => c.state === 'APPLIED',
        ).length,
      scope,
    ),
    2,
  );
  await reopened.evaluate(() => window.store.lockLocalAccount());
  assert.equal(
    await reopened.evaluate(() => window.store.activeScope()),
    undefined,
  );
  // Uma preparação de outra aba/em voo não pode desfazer bloqueio explícito.
  await reopened.evaluate((s) => window.store.saveSnapshot(s), snapshot);
  assert.equal(
    await reopened.evaluate(() => window.store.activeScope()),
    undefined,
  );
  assert.equal(
    await reopened.evaluate(
      async (s) => (await window.store.localCommands(s)).length,
      scope,
    ),
    2,
  );
  const retryBudget = await reopened.evaluate(
    async ({ scope, snapshot }) => {
      const state = await window.store.preparationState();
      await window.store.prepareSnapshot(snapshot, state.generation, true);
      const id = crypto.randomUUID();
      await window.store.enqueue({
        ...scope,
        id,
        contractVersion: 1,
        type: 'ORDER',
        capturedAt: new Date().toISOString(),
        dependencies: [],
        payload: {},
      });
      const original = window.fetch;
      let fail = false;
      window.fetch = async (_url, options) =>
        options?.method === 'POST'
          ? fail
            ? Response.json({}, { status: 503 })
            : Response.json({ id, status: 'WAITING' })
          : Response.json(snapshot);
      try {
        for (let i = 0; i < 8; i++) {
          const command = (await window.store.localCommands(scope)).find(
            (c) => c.id === id,
          );
          await window.store.updateCommand({ ...command, nextAttemptAt: 0 });
          await window.synchronize(scope);
        }
        const command = (await window.store.localCommands(scope)).find(
          (c) => c.id === id,
        );
        await window.store.updateCommand({ ...command, nextAttemptAt: 0 });
        fail = true;
        await window.synchronize(scope);
        return (await window.store.localCommands(scope)).find(
          (c) => c.id === id,
        );
      } finally {
        window.fetch = original;
      }
    },
    { scope, snapshot },
  );
  assert.equal(retryBudget.state, 'WAITING');
  assert.equal(retryBudget.attempts, 1);
  await fs.mkdir('artifacts/orders', { recursive: true });
  for (const viewport of [
    { width: 1366, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const ui = await context.newPage();
    await ui.setViewportSize(viewport);
    await bootstrap(ui);
    await ui.addStyleTag({
      content: (await fs.readFile('src/app/globals.css', 'utf8')).replace(
        /@import[^;]+;/g,
        '',
      ),
    });
    await ui.evaluate(() => window.renderWizard());
    await ui
      .getByRole('button', { name: 'Adicionar Perfume de teste' })
      .click();
    if (viewport.width === 390)
      await ui.getByRole('button', { name: /Continuar/ }).click();
    await ui
      .getByLabel('Cliente', { exact: true })
      .selectOption('22222222-2222-4222-8222-222222222222');
    await ui.getByLabel('Endereço de entrega').fill('Rua TEST, 120');
    if (viewport.width === 390) {
      await ui.getByRole('button', { name: /Continuar/ }).click();
      await ui.getByRole('button', { name: 'Voltar', exact: true }).click();
      assert.equal(
        await ui.getByLabel('Endereço de entrega').inputValue(),
        'Rua TEST, 120',
      );
      await ui.getByRole('button', { name: /Continuar/ }).click();
    }
    await ui
      .getByRole('button', { name: 'Confirmar pedido', exact: true })
      .click();
    await ui.getByRole('alert').waitFor();
    if (viewport.width === 390)
      await ui.getByRole('button', { name: 'Voltar', exact: true }).click();
    assert.equal(
      await ui.getByLabel('Endereço de entrega').inputValue(),
      'Rua TEST, 120',
    );
    assert.equal(
      await ui.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await ui.screenshot({
      path: `artifacts/orders/wizard-${viewport.width}.png`,
      fullPage: true,
    });
    await ui.close();
  }

  // Rascunho real: recarregar, recuperar envio incerto e reenviar a MESMA intenção.
  for (const width of [1366, 390]) {
    const ui = await context.newPage();
    await ui.setViewportSize({ width, height: 900 });
    await bootstrap(ui);
    await ui.addStyleTag({
      content: (await fs.readFile('src/app/globals.css', 'utf8')).replace(
        /@import[^;]+;/g,
        '',
      ),
    });
    await ui.evaluate((s) => window.renderWizard(s), scope);
    await ui
      .getByRole('button', { name: 'Adicionar Perfume de teste' })
      .click();
    if (width === 390)
      await ui.getByRole('button', { name: /Continuar/ }).click();
    await ui
      .getByLabel('Cliente', { exact: true })
      .selectOption('22222222-2222-4222-8222-222222222222');
    await ui.getByLabel('Endereço de entrega').fill('Rua rascunho TEST, 42');
    await ui.waitForFunction(
      async (s) =>
        (await window.drafts.readOrderDraft(s))?.fields.address ===
        'Rua rascunho TEST, 42',
      scope,
    );
    const original = await ui.evaluate(
      (s) => window.drafts.readOrderDraft(s),
      scope,
    );
    await ui.reload();
    await ui.addScriptTag({ content: bundle.outputFiles[0].text });
    await ui.addStyleTag({
      content: (await fs.readFile('src/app/globals.css', 'utf8')).replace(
        /@import[^;]+;/g,
        '',
      ),
    });
    await ui.evaluate((s) => window.renderWizard(s), scope);
    await ui.waitForFunction(() =>
      document.querySelector('input[value="Rua rascunho TEST, 42"]'),
    );
    assert.equal(
      await ui.getByLabel('Endereço de entrega').inputValue(),
      'Rua rascunho TEST, 42',
    );
    if (width === 390)
      await ui.getByRole('button', { name: /Continuar/ }).click();
    await ui.evaluate(() => {
      window.failTransport = true;
    });
    await ui
      .getByRole('button', { name: 'Confirmar pedido', exact: true })
      .click();
    await ui
      .getByRole('button', { name: 'Tentar confirmar o mesmo pedido' })
      .waitFor();
    await ui.waitForFunction(() => window.actionCalls?.length === 1);
    const outgoing = await ui.evaluate(() => window.lastPayload);
    assert.equal(outgoing.idempotencyKey, original.id);
    const persisted = await ui.evaluate(
      (s) => window.drafts.readOrderDraft(s),
      scope,
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(persisted.submission)),
      JSON.parse(JSON.stringify(outgoing)),
    );
    await ui.reload();
    await ui.addScriptTag({ content: bundle.outputFiles[0].text });
    await ui.addStyleTag({
      content: (await fs.readFile('src/app/globals.css', 'utf8')).replace(
        /@import[^;]+;/g,
        '',
      ),
    });
    await ui.evaluate((s) => window.renderWizard(s, '120'), scope);
    await ui
      .getByRole('button', { name: 'Tentar confirmar o mesmo pedido' })
      .click();
    await ui.waitForFunction(() => window.actionCalls?.length === 1);
    assert.deepEqual(
      await ui.evaluate(() => JSON.parse(JSON.stringify(window.lastPayload))),
      JSON.parse(JSON.stringify(outgoing)),
    );
    assert.equal(
      await ui.getByLabel('Cliente', { exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await ui.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await ui.screenshot({
      path: `artifacts/orders/draft-recovery-${width}.png`,
      fullPage: true,
    });
    await ui.evaluate((id) => {
      window.actionResult = { ok: true, id, message: 'Confirmado' };
    }, original.id);
    await ui
      .getByRole('button', { name: 'Tentar confirmar o mesmo pedido' })
      .click();
    await ui.waitForFunction(() => window.lastRoute?.startsWith('/pedidos/'));
    assert.equal(
      await ui.evaluate((s) => window.drafts.readOrderDraft(s), scope),
      undefined,
    );
    await ui.close();
  }
  console.log(
    'PASS: IndexedDB reload/reopen, account isolation, atomic enqueue, two-tab lease, expired session preservation, ordered ORDER/PAYMENT sync; desktop/mobile wizard, draft reload and exact retry after lost response, deletion only after acknowledgement, back/error state preservation, no horizontal overflow. HTTP boundaries simulated.',
  );
} finally {
  await context.close();
  await browser.close();
}

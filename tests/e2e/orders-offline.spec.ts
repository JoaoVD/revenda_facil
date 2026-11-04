import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
// Ambiente SaaS de teste descartável, com Supabase e PostgreSQL já configurados.
// Fixture exclusiva: produto a R$ 100, pelo menos 10 unidades e cliente ativo.
test('pedido e fatos offline sincronizam com a sessão SaaS', async ({
  page,
  context,
  baseURL,
  isMobile,
}) => {
  test.skip(
    !process.env.E2E_EMAIL ||
      !process.env.E2E_PASSWORD ||
      !process.env.E2E_PRODUCT_ID ||
      !process.env.E2E_CUSTOMER_ID ||
      !process.env.E2E_PRODUCT_NAME ||
      process.env.E2E_ALLOW_WRITES !== 'true',
    'Requer conta, fixtures e autorização explícita em ambiente SaaS descartável.',
  );
  test.setTimeout(120000);
  const base = baseURL!.replace(/\/$/, ''),
    password = process.env.E2E_PASSWORD!;
  const productId = process.env.E2E_PRODUCT_ID!,
    customerId = process.env.E2E_CUSTOMER_ID!;
  const viewport = { width: isMobile ? 390 : 1366 };
  await mkdir('artifacts/orders', { recursive: true });
  await page.goto(base + '/login');
  await page.getByLabel('Seu e-mail').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar na minha revenda' }).click();
  await page.waitForURL(base + '/');
  const initial = await (await page.request.get(base + '/api/sync')).json();
  const initialStock = initial.products.find(
    (p: { id: string }) => p.id === productId,
  ).stock;
  await page.goto(`${base}/pedidos/novo`);
  await page
    .getByRole('button', { name: 'Adicionar ' + process.env.E2E_PRODUCT_NAME! })
    .click();
  await page
    .getByRole('button', { name: 'Adicionar ' + process.env.E2E_PRODUCT_NAME! })
    .click();
  if (viewport.width === 390)
    await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByLabel('Cliente', { exact: true }).selectOption(customerId);
  await page.getByLabel('Endereço de entrega').fill('Rua TEST, 120');
  if (viewport.width === 390)
    await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByLabel('Recebimento', { exact: true }).selectOption('PART');
  await page.getByLabel('Valor já recebido (R$)').fill('60');
  await page.getByRole('button', { name: '+ Parcela', exact: true }).click();
  await page.getByLabel('1ª parcela (R$)').fill('140');
  await page
    .getByRole('button', { name: 'Confirmar pedido', exact: true })
    .click();
  await page.waitForURL(/\/pedidos\/[0-9a-f-]{36}$/);
  const saleId = page.url().split('/').at(-1)!;
  let snapshot = await (await page.request.get(`${base}/api/sync`)).json();
  let stored = snapshot.products.find(
    (p: { id: string }) => p.id === productId,
  );
  assert.equal(stored.reserved, 2);
  const paymentsBefore = snapshot.sales.find(
    (s: { id: string }) => s.id === saleId,
  ).payments.length;
  await page
    .getByRole('button', { name: 'Confirmar entrega integral', exact: true })
    .click();
  await expect(page.getByText('Entregue', { exact: true })).toBeVisible();
  snapshot = await (await page.request.get(`${base}/api/sync`)).json();
  assert.equal(
    snapshot.sales.find((s: { id: string }) => s.id === saleId).payments.length,
    paymentsBefore,
  );
  stored = snapshot.products.find((p: { id: string }) => p.id === productId);
  assert.equal(stored.reserved, 0);
  await page.getByText('Registrar recebimento', { exact: true }).click();
  await page.getByLabel(/Valor recebido \(saldo/).fill('30');
  await page
    .getByRole('button', { name: 'Confirmar recebimento', exact: true })
    .click();
  await expect(
    page.getByText('R$ 110,00', { exact: true }).first(),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `artifacts/orders/detail-real-${viewport.width}.png`,
    fullPage: true,
  });
  await page.goto(`${base}/dashboard`);
  await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
  await expect(page.getByText('Estoque atual', { exact: true })).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `artifacts/orders/dashboard-real-${viewport.width}.png`,
    fullPage: true,
  });
  if (viewport.width === 390) {
    await page.goto(`${base}/operacao`);
    await expect(page.getByRole('status')).toContainText('Tudo sincronizado', {
      timeout: 20000,
    });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
    await page
      .getByRole('button', { name: '+ Novo pedido', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Cadastrar cliente', exact: true })
      .click();
    await page.getByLabel('Nome', { exact: true }).fill('Cliente OFFLINE TEST');
    await page
      .getByRole('button', { name: 'Salvar neste aparelho', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Adicionar ' + process.env.E2E_PRODUCT_NAME!,
      })
      .click();
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page
      .getByLabel('Cliente', { exact: true })
      .selectOption({ label: 'Cliente OFFLINE TEST' });
    await page.getByLabel('Como será o atendimento?').selectOption('PICKUP');
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page
      .getByRole('button', { name: 'Confirmar pedido', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: /^Pedido #/ }),
    ).toBeVisible();
    await page.getByLabel('Valor efetivamente recebido (R$)').fill('60');
    await page
      .getByRole('button', { name: 'Registrar recebimento neste aparelho' })
      .click();
    await expect(page.getByText(/Falta receber:.*40/)).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Confirmar retirada integral neste aparelho',
      })
      .click();
    await expect(
      page.getByText('Atendimento concluído', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Sincronizar agora' }).click();
    await expect(page.getByRole('status')).toContainText('Tudo sincronizado', {
      timeout: 60000,
    });
    const commands = await page.evaluate(
      () =>
        new Promise<{ state: string }[]>((resolve, reject) => {
          const opening = indexedDB.open('revenda-offline-v1');
          opening.onsuccess = () => {
            const database = opening.result,
              request = database
                .transaction('commands')
                .objectStore('commands')
                .getAll();
            request.onsuccess = () => {
              resolve(request.result);
              database.close();
            };
            request.onerror = () => reject(request.error);
          };
        }),
    );
    assert.deepEqual(
      commands.map((c) => c.state),
      ['APPLIED', 'APPLIED', 'APPLIED', 'APPLIED'],
    );
    snapshot = await (await page.request.get(`${base}/api/sync`)).json();
    assert.equal(
      snapshot.products.find((p: { id: string }) => p.id === productId).stock,
      initialStock - 3,
    );
    const cacheKeys = await page.evaluate(async () => {
      const keys = [];
      for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys())
          keys.push(new URL(request.url).pathname);
      return keys;
    });
    assert(
      cacheKeys.every(
        (key) => key === '/operacao' || key.startsWith('/_next/static/'),
      ),
    );
    console.log(
      'PASS real offline: cached shell reload, order + receipt + delivery persisted and synced, no authenticated HTML/API cache.',
    );
  }
});

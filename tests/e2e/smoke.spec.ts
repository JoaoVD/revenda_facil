import { test, expect } from '@playwright/test';
test('acesso protegido e login acessível', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole('heading', { name: 'Vamos começar?' }),
  ).toBeVisible();
  await expect(page.getByLabel('Seu e-mail')).toBeVisible();
  await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.body).toBeLessThanOrEqual(width.viewport);
});
test('cadastro, compra, venda e estoque com autenticação real', async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_EMAIL ||
      !process.env.E2E_PASSWORD ||
      process.env.E2E_ALLOW_WRITES !== 'true',
    'Requer usuário Supabase confirmado, com organização de teste já configurada.',
  );
  await page.goto('/login');
  await page.getByLabel('Seu e-mail').fill(process.env.E2E_EMAIL!);
  await page
    .getByLabel('Senha', { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar na minha revenda' }).click();
  await expect(page).toHaveURL('/');
  const name = `Perfume E2E ${Date.now()}`;
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await page.getByLabel('Nome do produto').fill(name);
  await page.getByLabel('Código interno (SKU)').fill(`E2E-${Date.now()}`);
  await page.getByLabel('Custo de referência (R$)').fill('40');
  await page.getByLabel('Preço de venda (R$)').fill('100');
  await page.getByRole('button', { name: 'Cadastrar produto' }).click();
  await expect(page.locator('.success')).toContainText('Registro salvo');
  await page.goto('/compras');
  await page
    .getByRole('button', { name: 'Receber mercadorias', exact: true })
    .click();
  await page.getByLabel('Fornecedor', { exact: true }).fill('Fornecedor E2E');
  // Busca opção pelo texto preservando o SKU gerado.
  const option = page
    .getByLabel('Produto', { exact: true })
    .locator('option')
    .filter({ hasText: name });
  const id = await option.getAttribute('value');
  await page.getByLabel('Produto', { exact: true }).selectOption(id!);
  await page.getByLabel('Quantidade', { exact: true }).fill('10');
  await page.getByLabel('Custo por unidade (R$)').fill('40');
  await page
    .getByRole('button', { name: 'Confirmar entrada no estoque' })
    .click();
  await expect(page.locator('.success')).toContainText('Registro salvo');
  await page.goto('/vendas');
  await page.getByLabel('Buscar produto').fill(name);
  const tile = page
    .getByRole('button')
    .filter({ hasText: name })
    .filter({ hasText: 'Adicionar' });
  await tile.click();
  await tile.click();
  await page
    .getByRole('button', { name: 'Preencher valor total recebido' })
    .click();
  await page.getByRole('button', { name: 'Finalizar venda' }).click();
  await expect(page.locator('.success')).toContainText('Pedido confirmado');
  await page.goto('/estoque');
  const row = page.getByRole('row').filter({ hasText: name }).first();
  await expect(row).toContainText('8 unidades');
});

// Componente real em Chromium. PushManager, permissão e HTTP simulados;
// não comprova entrega em Android/iOS nem substitui homologação HTTPS.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {PushSettings} from './src/modules/reminders/push-settings';createRoot(document.getElementById('root')).render(<PushSettings/>);`,
    loader: 'tsx',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const browser = await chromium.launch({
  channel: process.env.UX_BROWSER_CHANNEL || 'chrome',
});
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const calls = [];
    let active = false;
    await page.route('http://localhost/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="pt-BR"><div id="root" style="padding:16px"></div></html>',
      }),
    );
    await page.route('http://localhost/api/push', async (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            configured: true,
            publicKey: Buffer.alloc(65, 4).toString('base64url'),
          }),
        });
      const input = route.request().postDataJSON();
      calls.push(input.action);
      if (input.action === 'subscribe') active = true;
      if (input.action === 'unsubscribe') active = false;
      return route.fulfill({
        status: input.action === 'test' ? 202 : 200,
        contentType: 'application/json',
        body: JSON.stringify({
          active,
          ok: true,
          message:
            'Teste enviado ao serviço de notificações. Confira este aparelho.',
        }),
      });
    });
    await page.addInitScript(() => {
      window.permissionRequests = 0;
      Object.defineProperty(window, 'Notification', {
        value: {
          permission: 'default',
          requestPermission: async () => {
            window.permissionRequests++;
            window.Notification.permission = 'granted';
            return 'granted';
          },
        },
      });
      Object.defineProperty(window, 'PushManager', {
        value: function PushManager() {},
      });
      let sub = null;
      const reg = {
        pushManager: {
          getSubscription: async () => sub,
          subscribe: async (options) => {
            sub = {
              endpoint: 'https://fcm.googleapis.com/fcm/send/TEST',
              options,
              toJSON: () => ({
                endpoint: 'https://fcm.googleapis.com/fcm/send/TEST',
                keys: {},
              }),
              unsubscribe: async () => {
                sub = null;
                return true;
              },
            };
            return sub;
          },
        },
      };
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: async () => reg, ready: Promise.resolve(reg) },
      });
    });
    await page.goto('http://localhost/');
    await page.addStyleTag({
      content: (await fs.readFile('src/app/globals.css', 'utf8')).replace(
        /@import[^;]+;/g,
        '',
      ),
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const enable = page.getByRole('button', {
      name: 'Ativar notificações neste aparelho',
      exact: true,
    });
    await enable.waitFor();
    await page.waitForFunction(
      () => !document.querySelector('button')?.disabled,
    );
    assert.equal(await page.evaluate(() => window.permissionRequests), 0);
    await enable.click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Notificações ativadas' })
      .waitFor();
    assert.equal(await page.evaluate(() => window.permissionRequests), 1);
    await page
      .getByRole('button', { name: 'Enviar notificação de teste' })
      .click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Teste enviado ao serviço' })
      .waitFor();
    await page
      .getByRole('button', { name: 'Desativar neste aparelho' })
      .click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Notificações desativadas' })
      .waitFor();
    assert.deepEqual(calls, ['subscribe', 'test', 'unsubscribe']);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await fs.mkdir('artifacts/push', { recursive: true });
    await page.screenshot({
      path: `artifacts/push/settings-${width}.png`,
      fullPage: true,
    });
    await page.close();
  }
  const ios = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile',
  });
  await ios.route('http://localhost/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await ios.goto('http://localhost/');
  await ios.addScriptTag({ content: bundle.outputFiles[0].text });
  await ios
    .getByRole('status')
    .filter({ hasText: 'Adicionar à Tela de Início' })
    .waitFor();
  assert.equal(await ios.getByRole('button').count(), 0);
  await ios.close();
  console.log(
    'PASS: push settings desktop/mobile, permission only after click, enable/test/disable, iOS Home Screen guidance and no overflow. Browser push/HTTP simulated.',
  );
} finally {
  await browser.close();
}

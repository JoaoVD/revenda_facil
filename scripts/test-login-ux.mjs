import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {LoginForm} from './src/components/login-form'; const mode=new URLSearchParams(location.search).get('mode'); createRoot(document.getElementById('root')).render(<LoginForm configured={mode!=='unconfigured'}/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'actions',
      setup(api) {
        api.onResolve({ filter: /^@\/app\/actions$/ }, (args) => ({
          path: args.path,
          namespace: 'stub',
        }));
        api.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `async function action(_,form){window.submitted=Object.fromEntries(form); return {ok:false,message:'Simulated response'};} export {action as loginAction};`,
        }));
      },
    },
  ],
});
const browser = await chromium.launch({
  channel: process.env.UX_BROWSER_CHANNEL || 'chrome',
});
try {
  for (const mode of ['login', 'signup', 'unconfigured']) {
    const page = await browser.newPage();
    await page.route('http://localhost/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"></div>',
      }),
    );
    await page.goto(`http://localhost/?mode=${mode}`);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    if (mode === 'signup')
      await page
        .getByRole('button', { name: 'Primeiro acesso? Criar conta' })
        .click();
    const input = page.locator('input:not([type=hidden])').first();
    await input.waitFor();
    assert.equal(await input.getAttribute('name'), 'email');
    await input.fill('test@example.com');
    await page.locator('input[type=password]').fill('temporary-test-password');
    assert.equal(
      await input.evaluate((el) => el.checkValidity()),
      true,
      `valid identifier in ${mode}`,
    );
    await input.fill('invalid-email');
    assert.equal(await input.evaluate((el) => el.checkValidity()), false);
    await input.fill('test@example.com');
    if (mode === 'unconfigured') {
      assert.equal(await page.locator('button.button').isDisabled(), true);
      await page.close();
      continue;
    }
    await page.locator('button[type=submit], button.button').first().click();
    await page.waitForFunction(() => window.submitted);
    assert.equal(
      await page.evaluate(() => window.submitted.mode),
      mode === 'signup' ? 'signup' : 'login',
    );
    assert.equal(
      await page
        .getByRole('button', {
          name:
            mode === 'signup'
              ? 'Já tenho conta. Entrar'
              : 'Primeiro acesso? Criar conta',
        })
        .count(),
      1,
    );
    await page.close();
  }
  console.log(
    'SaaS login/signup and disabled access without Supabase configuration passed. Browser validation and submitted mode checked; server action simulated.',
  );
} finally {
  await browser.close();
}

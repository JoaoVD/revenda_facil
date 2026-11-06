import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

// Mesma precedência do desenvolvimento Next: ambiente > .env.local > .env.
for (const file of ['.env.local', '.env'])
  if (existsSync(file)) loadEnvFile(file);
let hidden = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!hidden) process.stdout.write(chunk, encoding);
    callback();
  },
});
const prompt = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
let bundlePath;
let db;
let supabase;
try {
  for (const name of [
    'DATABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ])
    if (!process.env[name])
      throw new Error(
        `Configure ${name} no ambiente local antes de continuar.`,
      );
  console.log(
    'Demonstração isolada: use um e-mail exclusivo, sem revenda já cadastrada.',
  );
  const email =
    process.env.DEMO_EMAIL ||
    (await prompt.question('E-mail da conta demo: ')).trim();
  if (!email || !email.includes('@'))
    throw new Error('Informe um e-mail válido que você controle.');
  let password = process.env.DEMO_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY)
      throw new Error(
        'Execute em um terminal interativo ou informe DEMO_PASSWORD no ambiente local.',
      );
    process.stdout.write('Senha da conta demo (oculta): ');
    hidden = true;
    password = await prompt.question('');
    hidden = false;
    process.stdout.write('\n');
  }
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  if (process.argv.includes('--create-account')) {
    if (password.length < 12)
      throw new Error('Use uma senha exclusiva com pelo menos 12 caracteres.');
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: new URL(
          '/login',
          process.env.APP_URL || 'http://localhost:3000',
        ).href,
      },
    });
    if (result.error)
      throw new Error(
        `Não foi possível solicitar a conta: ${result.error.message}`,
      );
    if (!result.data.session) {
      console.log(
        'Confirme o e-mail enviado pelo Supabase. Depois execute npm run demo:seed (sem --create-account). Não conclua o cadastro da revenda: o comando fará isso.',
      );
      process.exitCode = 0;
    }
  }
  if (
    !process.argv.includes('--create-account') ||
    (await supabase.auth.getSession()).data.session
  ) {
    const signed = await supabase.auth.signInWithPassword({ email, password });
    password = undefined;
    if (signed.error)
      throw new Error(
        'Login não confirmado. Confira o e-mail, a senha e a confirmação do e-mail no Supabase.',
      );
    // Verificação no servidor de autenticação; não aceita userId fornecido na CLI.
    const verified = await supabase.auth.getUser();
    if (verified.error || !verified.data.user)
      throw new Error('Não foi possível validar a identidade da conta demo.');
    await mkdir('.local/demo-seed', { recursive: true });
    bundlePath = `.local/demo-seed/run-${crypto.randomUUID()}.mjs`;
    const bundle = await build({
      stdin: {
        contents:
          "export { seedDemo } from './src/modules/demo/seed'; export { db } from './src/lib/db';",
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      packages: 'external',
    });
    await writeFile(bundlePath, bundle.outputFiles[0].text);
    const seedModule = await import(
      pathToFileURL(`${process.cwd()}/${bundlePath}`).href
    );
    db = seedModule.db;
    const result = await seedModule.seedDemo(verified.data.user.id);
    console.log(
      result.alreadySeeded
        ? 'Demonstração já preparada; seus testes foram preservados.'
        : 'Demonstração preparada com sucesso.',
    );
    console.log(
      `${result.products} produtos | ${result.customers} clientes | ${result.purchases} compras | ${result.sales} vendas/pedidos | ${result.payments} pagamentos`,
    );
    console.log(
      `Entre no sistema com o mesmo e-mail e senha. ${process.env.APP_URL || ''}`,
    );
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Não foi possível preparar a demonstração.',
  );
  process.exitCode = 1;
} finally {
  prompt.close();
  await supabase?.auth.signOut({ scope: 'local' });
  await db?.$disconnect();
  if (bundlePath) await rm(bundlePath, { force: true });
}

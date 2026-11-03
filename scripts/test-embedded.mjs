// Validação adicional com o motor PostgreSQL em WASM. Não substitui corrida multi-sessão no PostgreSQL convencional.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
const pg = await PGlite.create();
for (const entry of readdirSync('prisma/migrations', { withFileTypes: true })
  .filter((x) => x.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))) {
  await pg.exec(
    readFileSync(`prisma/migrations/${entry.name}/migration.sql`, 'utf8'),
  );
}
const server = new PGLiteSocketServer({
  db: pg,
  host: '127.0.0.1',
  port: 55432,
  maxConnections: 1,
});
await server.start();
const url =
  'postgresql://postgres:postgres@127.0.0.1:55432/template1?connection_limit=1&pool_timeout=60&statement_cache_size=0';
try {
  const child = spawn(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run'],
    {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url },
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  await server.stop();
  await pg.close();
}

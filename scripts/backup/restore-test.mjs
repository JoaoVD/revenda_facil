import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { connection } from './connection.mjs';
try {
  const { url, database, env } = connection(
    process.env.RESTORE_TEST_DATABASE_URL,
  );
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^revenda_restore_[a-z0-9_]+$/.test(database)
  )
    throw new Error(
      'Restauração de teste aceita somente banco local revenda_restore_* dedicado e vazio.',
    );
  const archive = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.statSync(archive).isFile())
    throw new Error('Informe o arquivo .dump de backup.');
  function query(sql) {
    const result = spawnSync(
      'psql',
      ['--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
      { env, encoding: 'utf8', timeout: 60000 },
    );
    if (result.error || result.status !== 0)
      throw new Error('Não foi possível verificar o banco de restauração.');
    return result.stdout.trim();
  }
  if (
    query(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')",
    ) !== '0'
  )
    throw new Error(
      'O banco de restauração não está vazio. Nenhuma tabela foi apagada.',
    );
  const restored = spawnSync(
    'pg_restore',
    [
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      database,
      archive,
    ],
    { env, stdio: 'pipe', timeout: 30 * 60 * 1000 },
  );
  if (restored.error || restored.status !== 0)
    throw new Error(
      'pg_restore falhou. Banco de teste pode conter restauração parcial; recrie-o antes de tentar novamente.',
    );
  const badStock = query(
    'SELECT count(*) FROM "Product" WHERE stock < 0 OR reserved < 0 OR reserved > stock',
  );
  const badMoney = query('SELECT count(*) FROM "Payment" WHERE amount <= 0');
  const migrations = query(
    'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  if (badStock !== '0' || badMoney !== '0' || Number(migrations) < 1)
    throw new Error(
      'Restauração concluída, mas verificação de integridade falhou.',
    );
  console.log(
    'Restauração de teste concluída; migrations, estoque e lançamentos financeiros verificados. O banco restaurado permanece disponível para conferência.',
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Falha no teste de restauração.',
  );
  process.exitCode = 1;
}

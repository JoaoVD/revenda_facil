import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { connection } from './connection.mjs';
try {
  const { env } = connection(process.env.DATABASE_BACKUP_URL);
  const destination = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !destination.endsWith('.dump'))
    throw new Error('Informe um destino novo terminado em .dump.');
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  // Reserva o nome sem sobrescrever backups anteriores.
  const fd = fs.openSync(destination, 'wx', 0o600);
  fs.closeSync(fd);
  const partial = `${destination}.partial`;
  try {
    const partialFd = fs.openSync(partial, 'wx', 0o600);
    fs.closeSync(partialFd);
    const result = spawnSync(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-privileges', '--file', partial],
      { env, stdio: 'pipe', timeout: 30 * 60 * 1000 },
    );
    if (result.error?.code === 'ENOENT')
      throw new Error(
        'Instale o cliente pg_dump compatível com o servidor PostgreSQL.',
      );
    if (/server version mismatch/i.test(String(result.stderr)))
      throw new Error(
        'A versão do pg_dump é anterior à versão do servidor. Instale um cliente compatível.',
      );
    if (result.error || result.status !== 0)
      throw new Error(
        'pg_dump falhou. Verifique conectividade, permissões e versão do cliente PostgreSQL.',
      );
    fs.renameSync(partial, destination);
  } catch (error) {
    fs.rmSync(partial, { force: true });
    fs.rmSync(destination, { force: true });
    throw error;
  }
  console.log(`Backup concluído: ${destination}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha no backup.');
  process.exitCode = 1;
}

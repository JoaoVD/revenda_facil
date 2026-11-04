// Apenas CI: usa bancos descartáveis explicitamente configurados, nunca DATABASE_URL implícita.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { connection } from './connection.mjs';
const { env, database } = connection(process.env.TEST_DATABASE_URL);
if (process.env.CI !== 'true' || database !== 'revenda_test')
  throw new Error('Execute somente no CI com revenda_test descartável.');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenda-backup-'));
const file = path.join(dir, 'test.dump');
const url = new URL(process.env.TEST_DATABASE_URL);
url.pathname = '/revenda_restore_ci';
function sql(query, customEnv = env) {
  const result = spawnSync(
    'psql',
    ['--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query],
    { env: customEnv, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, 'Consulta de fixture falhou.');
  return result.stdout.trim();
}
function script(name, extra) {
  return spawnSync(process.execPath, [`scripts/backup/${name}.mjs`, file], {
    env: { ...process.env, ...extra },
    encoding: 'utf8',
  });
}
try {
  sql(
    `INSERT INTO "Organization" (id,name,"ownerName",cnpj,city,"updatedAt") VALUES ('aaaaaaaa-1111-4111-8111-111111111111','TEST BACKUP','TEST','BACKUP-TEST','TEST',now());`,
  );
  sql(
    `INSERT INTO "Product" (id,"organizationId",name,sku,"referenceCost","salePrice",stock,reserved,"updatedAt") VALUES ('bbbbbbbb-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','Perfume TEST','BACKUP-TEST',40,100,10,2,now());`,
  );
  sql('CREATE DATABASE revenda_restore_ci');
  const backup = script('create', {
    DATABASE_BACKUP_URL: process.env.TEST_DATABASE_URL,
  });
  assert.equal(backup.status, 0, backup.stderr);
  assert.equal(
    script('create', { DATABASE_BACKUP_URL: process.env.TEST_DATABASE_URL })
      .status,
    1,
    'Não sobrescrever backup',
  );
  assert.equal(
    script('restore-test', {
      RESTORE_TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    }).status,
    1,
    'Bloquear banco de origem',
  );
  const restored = script('restore-test', {
    RESTORE_TEST_DATABASE_URL: url.toString(),
  });
  assert.equal(restored.status, 0, restored.stderr);
  const restoredEnv = connection(url.toString()).env;
  assert.equal(
    sql(
      `SELECT stock || ':' || reserved || ':' || "salePrice" FROM "Product" WHERE sku='BACKUP-TEST'`,
      restoredEnv,
    ),
    '10:2:100.00',
  );
  assert.equal(
    script('restore-test', { RESTORE_TEST_DATABASE_URL: url.toString() })
      .status,
    1,
    'Bloquear banco não vazio',
  );
  console.log(
    'PASS: backup e restauração PostgreSQL, conteúdo preservado, bloqueio de sobrescrita e destino inseguro/não vazio.',
  );
} finally {
  sql('DROP DATABASE IF EXISTS revenda_restore_ci');
  sql(
    `DELETE FROM "Product" WHERE sku='BACKUP-TEST'; DELETE FROM "Organization" WHERE cnpj='BACKUP-TEST';`,
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

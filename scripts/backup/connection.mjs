// Credenciais passam pelo ambiente do subprocesso; nunca pela linha de comando/log.
export function connection(value) {
  if (!value) throw new Error('Configure a URL de banco exigida pelo comando.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('URL PostgreSQL inválida.');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database) throw new Error('Informe o banco de dados.');
  return {
    url,
    database,
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: database,
      PGSSLMODE:
        url.searchParams.get('sslmode') ||
        (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          ? 'prefer'
          : 'verify-full'),
      PGCONNECT_TIMEOUT: '15',
      PGAPPNAME: 'revenda-backup',
    },
  };
}

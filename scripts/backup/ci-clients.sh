#!/usr/bin/env bash
# Clientes da mesma imagem PostgreSQL do CI, sem depender de pacotes do runner.
set -eu
if [ "${CI:-}" != "true" ] || [ -z "${GITHUB_WORKSPACE:-}" ] || [ -z "${RUNNER_TEMP:-}" ]; then
  echo "Uso exclusivo do GitHub Actions." >&2
  exit 1
fi
mkdir -p "$RUNNER_TEMP/pgbin"
for client in pg_dump pg_restore psql; do
  cat > "$RUNNER_TEMP/pgbin/$client" <<'WRAPPER'
#!/usr/bin/env bash
set -eu
exec docker run --rm --network host \
  --user "$(id -u):$(id -g)" \
  -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE -e PGCONNECT_TIMEOUT \
  -v "$GITHUB_WORKSPACE:$GITHUB_WORKSPACE" -v "$RUNNER_TEMP:$RUNNER_TEMP" \
  --workdir "$GITHUB_WORKSPACE" \
  postgres:17-alpine "$(basename "$0")" "$@"
WRAPPER
  chmod 700 "$RUNNER_TEMP/pgbin/$client"
done

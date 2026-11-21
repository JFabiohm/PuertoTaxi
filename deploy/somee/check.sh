#!/usr/bin/env bash
# Verificación obligatoria antes de publicar en producción.
# Ejecuta: cd deploy/somee && ./check.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/.env}"

# shellcheck source=env.sh
source "$HERE/env.sh"
load_env "$ENV_FILE"

export DOTNET_ROOT="${DOTNET_ROOT:-/home/fabio/.dotnet}"
export PATH="$DOTNET_ROOT:$PATH"

echo "== 1/4 Compilando solución =="
dotnet build "$ROOT/PuertoTaxi.slnx" --nologo -v q

echo "== 2/4 Tests de integración =="
if [[ -n "${TEST_DB_TEMPLATE:-}" ]]; then
  # En Linux no hay LocalDB: la plantilla apunta al SQL de Docker.
  export PUERTOTAXI_TEST_DB_TEMPLATE="$TEST_DB_TEMPLATE"
  echo "Usando la BD de pruebas configurada en .env"
else
  echo "AVISO: sin TEST_DB_TEMPLATE; en Linux los tests necesitan SQL."
fi
dotnet test "$ROOT/PuertoTaxi.slnx" --nologo -v q

echo "== 3/4 Build del frontend =="
(cd "$ROOT/frontend" && npm run build)

echo "== 4/4 Comprobaciones rápidas =="
if curl -fsS --max-time 10 http://localhost:5218/health >/dev/null 2>&1; then
  echo "API local: OK"
else
  echo "API local: apagada (no bloquea la publicación)"
fi
if curl -fsS --max-time 10 http://localhost:5173/ >/dev/null 2>&1; then
  echo "Frontend local: OK"
else
  echo "Frontend local: apagado (no bloquea la publicación)"
fi

echo
echo "VERIFICACIÓN COMPLETA: listo para publicar con ./all.sh"

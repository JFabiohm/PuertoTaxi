#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/.env}"
FRONTEND_ENV="$ROOT/frontend/.env.production"

# shellcheck source=env.sh
source "$HERE/env.sh"

load_env "$ENV_FILE"

SOMEE_HOST="${SOMEE_HOST:-}"
SOMEE_HOST="${SOMEE_HOST#http://}"
SOMEE_HOST="${SOMEE_HOST#https://}"
SOMEE_HOST="${SOMEE_HOST%%/*}"
[[ -z "$SOMEE_HOST" || "$SOMEE_HOST" == "tuusuario.somee.com" ]] && \
  fail "Configura SOMEE_HOST en $ENV_FILE antes de preparar el frontend."

# FRONTEND_API_URL permite apuntar al mismo origen de Netlify y usar las
# reescrituras de _redirects (evita mixed content si Somee no tiene SSL).
SITE_URL="${FRONTEND_API_URL:-${SOMEE_SITE_URL:-https://$SOMEE_HOST}}"

python3 - "$FRONTEND_ENV" "$SITE_URL" <<'PY'
import re
import sys

path, url = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as fh:
    text = fh.read()

replacement = f"VITE_API_URL={url}\n"
if re.search(r"^VITE_API_URL=.*$", text, flags=re.M):
    text = re.sub(r"^VITE_API_URL=.*$", replacement.rstrip("\n"), text, flags=re.M)
else:
    text = replacement + text

with open(path, "w", encoding="utf-8") as fh:
    fh.write(text)
PY

echo "frontend/.env.production -> VITE_API_URL=$SITE_URL"
echo "Generando build de producción..."
cd "$ROOT/frontend"
npm run build

echo
echo "Listo para Netlify: $ROOT/frontend/dist"
find "$ROOT/frontend/dist" -maxdepth 1 -type f -printf '  %f\n' | sort

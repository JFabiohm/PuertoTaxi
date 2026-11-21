#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

"$HERE/publish.sh"
"$HERE/upload.sh"
"$HERE/deploy-frontend.sh"

echo
echo "Todo listo: API en Somee y frontend/dist preparado para Netlify."

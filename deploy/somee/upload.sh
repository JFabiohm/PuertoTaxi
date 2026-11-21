#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/.env}"
OUT="${OUT:-$HERE/publish}"

# shellcheck source=env.sh
source "$HERE/env.sh"

load_env "$ENV_FILE"

command -v curl >/dev/null 2>&1 || fail "Necesitas curl para usar este script."

for var in SOMEE_FTP_HOST SOMEE_FTP_USER SOMEE_FTP_PASSWORD; do
  [[ -z "${!var:-}" ]] && fail "Configura $var en $ENV_FILE para subir por FTP."
done

[[ -d "$OUT" ]] || fail "No existe $OUT. Ejecuta primero ./publish.sh."

tls=()
case "${SOMEE_FTP_TLS:-true}" in
  1|true|TRUE|yes|YES|on|ON) tls=(--ssl-reqd) ;;
esac

port="${SOMEE_FTP_PORT:-21}"
root="${SOMEE_REMOTE_ROOT:-/}"
root="/${root#/}"
root="${root%/}"   # si era '/', queda cadena vacía

NETRC="$(mktemp "${TMPDIR:-/tmp}/puertotaxi-netrc.XXXXXX")"
chmod 600 "$NETRC"
trap 'rm -f "$NETRC"' EXIT

{
  printf 'machine %s\n' "$SOMEE_FTP_HOST"
  printf 'login %s\n' "$SOMEE_FTP_USER"
  printf 'password %s\n' "$SOMEE_FTP_PASSWORD"
} > "$NETRC"

count=0

# IIS bloquea los DLL mientras la app está corriendo: la ponemos offline.
offline_file="$(mktemp "${TMPDIR:-/tmp}/puertotaxi-offline.XXXXXX")"
printf '<!doctype html><title>Mantenimiento</title><h1>Actualizando API...</h1>' > "$offline_file"
trap 'rm -f "$NETRC" "$offline_file"' EXIT

curl --silent --show-error --fail --netrc-file "$NETRC" "${tls[@]}" \
  -T "$offline_file" "ftp://${SOMEE_FTP_HOST}:${port}${root}/app_offline.htm"
sleep 3

upload_one() {
  local file="$1" rel url
  rel="${file#$OUT/}"
  url="ftp://${SOMEE_FTP_HOST}:${port}${root}/${rel}"

  curl --silent --show-error --fail \
    --netrc-file "$NETRC" \
    --ftp-create-dirs \
    "${tls[@]}" \
    -T "$file" \
    "$url"

  count=$((count + 1))
  printf '  subido %s\n' "$rel"
}

# El plan free tiene 150 MB: limpiamos la carpeta antes de subir.
if [[ "${SOMEE_FTP_CLEAN:-false}" == "true" ]]; then
  echo "Limpiando $root en el servidor..."
  python3 - "$SOMEE_FTP_HOST" "$SOMEE_FTP_USER" "$SOMEE_FTP_PASSWORD" "$root" <<'PY'
import sys
from ftplib import FTP

host, user, password, root = sys.argv[1:5]
ftp = FTP(host, timeout=30)
ftp.login(user, password)
ftp.cwd(root or "/")

def wipe():
    for name in list(ftp.nlst()):
        if name in (".", "..", "web.config", "logs", "app_offline.htm"):
            continue
        name = name.rsplit("/", 1)[-1]
        try:
            ftp.cwd(name)
        except Exception:
            try:
                ftp.delete(name)
            except Exception:
                pass  # archivo bloqueado por IIS; se sobrescribe al subir
        else:
            wipe()
            ftp.cwd("..")
            try:
                ftp.rmd(name)
            except Exception:
                pass

wipe()
ftp.quit()
PY
fi

echo "Subiendo $OUT a ftp://$SOMEE_FTP_HOST:$port$root/ ..."

# El web.config se sube al final para minimizar ventanas de reinicio.
while IFS= read -r -d '' file; do
  upload_one "$file"
done < <(find "$OUT" -type f ! -name web.config -print0)

if [[ -f "$OUT/web.config" ]]; then
  upload_one "$OUT/web.config"
fi

# Reactivamos la app.
python3 - "$SOMEE_FTP_HOST" "$SOMEE_FTP_USER" "$SOMEE_FTP_PASSWORD" "$root" <<'PY'
import sys
from ftplib import FTP
host, user, password, root = sys.argv[1:5]
ftp = FTP(host, timeout=30)
ftp.login(user, password)
ftp.cwd(root or "/")
try:
    ftp.delete("app_offline.htm")
except Exception:
    pass
ftp.quit()
PY

echo
echo "Listo: $count archivos subidos."
echo "Comprueba https://$SOMEE_HOST/health"

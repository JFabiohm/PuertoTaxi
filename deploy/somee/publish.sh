#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/.env}"
OUT="${OUT:-$HERE/publish}"

# shellcheck source=env.sh
source "$HERE/env.sh"

load_env "$ENV_FILE"

# Aceptar SOMEE_HOST con o sin esquema/barra final.
SOMEE_HOST="${SOMEE_HOST:-}"
SOMEE_HOST="${SOMEE_HOST#http://}"
SOMEE_HOST="${SOMEE_HOST#https://}"
SOMEE_HOST="${SOMEE_HOST%%/*}"
export SOMEE_HOST
export SOMEE_SITE_URL="${SOMEE_SITE_URL:-https://$SOMEE_HOST}"

# AllowedHosts: dominio principal + hosts extra (por ejemplo www).
allowed_hosts="$SOMEE_HOST"
if [[ -n "${SOMEE_EXTRA_HOSTS:-}" ]]; then
  IFS=',' read -ra extra_hosts <<< "$SOMEE_EXTRA_HOSTS"
  for host in "${extra_hosts[@]}"; do
    host="${host#http://}"
    host="${host#https://}"
    host="${host%%/*}"
    if [[ -n "$host" && ";$allowed_hosts;" != *";$host;"* ]]; then
      allowed_hosts="$allowed_hosts;$host"
    fi
  done
fi
if [[ -n "${SOMEE_ALLOWED_HOSTS_OVERRIDE:-}" ]]; then
  allowed_hosts="$SOMEE_ALLOWED_HOSTS_OVERRIDE"
fi
export SOMEE_ALLOWED_HOSTS="$allowed_hosts"

for var in SOMEE_HOST CONNECTION_STRING JWT_KEY SEED_ADMIN_PASSWORD; do
  [[ -z "${!var:-}" ]] && fail "Configura $var en $ENV_FILE."
done

[[ "$SOMEE_HOST" == "tuusuario.somee.com" ]] && fail "Sustituye SOMEE_HOST en $ENV_FILE."
[[ "${CONNECTION_STRING:-}" == *"..."* ]] && fail "Pega la connection string real de Somee en $ENV_FILE."
[[ "${JWT_KEY:-}" == CAMBIA-* ]] && fail "Genera una JWT_KEY aleatoria en $ENV_FILE."
[[ "${SEED_ADMIN_PASSWORD:-}" == CAMBIA-* ]] && fail "Configura SEED_ADMIN_PASSWORD en $ENV_FILE."

if [[ ${#JWT_KEY} -lt 32 ]]; then
  fail "JWT_KEY debe tener al menos 32 caracteres (tiene ${#JWT_KEY})."
fi

export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export PATH="$DOTNET_ROOT:$PATH"

# Limpieza: cada publicación anterior deja DLLs de otras arquitecturas.
rm -rf "$OUT"
mkdir -p "$OUT"

# SOMEE_RID vacío => publicación sin RID (processPath="dotnet", sin depender
# de la arquitectura del app pool). Útil en hosting compartido.
rid="${SOMEE_RID-win-x64}"   # vacío = publicar sin RID; con ':-' se ignoraría
if [[ -n "$rid" ]]; then
  runtime_args=(-r "$rid" --self-contained "${SOMEE_SELF_CONTAINED:-false}")
  echo "Publicando API ($rid, self-contained=${SOMEE_SELF_CONTAINED:-false})..."
else
  runtime_args=(-p:UseAppHost=false)
  echo "Publicando API (framework-dependent, sin RID, sin apphost)..."
fi
export SOMEE_PUBLISH_RID="$rid"

"$DOTNET_ROOT/dotnet" publish "$ROOT/src/PuertoTaxi.Api/PuertoTaxi.Api.csproj" \
  -c Release "${runtime_args[@]}" -o "$OUT"

# El SDK ya genera un web.config válido (ANCM v2 + ruta del ejecutable).
# Aquí solo inyectamos las variables de entorno de producción.
python3 - "$OUT/web.config" <<'PY'
import os
import sys
import xml.etree.ElementTree as ET

path = sys.argv[1]
tree = ET.parse(path)
root = tree.getroot()

webserver = root.find(".//system.webServer")
if webserver is None:
    raise SystemExit("No se encontró <system.webServer> en el web.config generado")

aspnetcore = webserver.find("aspNetCore")
if aspnetcore is None:
    raise SystemExit("No se encontró <aspNetCore> en el web.config generado")

def truthy(name):
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}

def val(name, default=""):
    return os.environ.get(name, default)

# Registro de arranque opcional.
aspnetcore.set("stdoutLogEnabled", "true" if truthy("SOMEE_STDOUT_LOG") else "false")
if truthy("SOMEE_STDOUT_LOG"):
    aspnetcore.set("stdoutLogFile", r".\logs\stdout")
if val("SOMEE_HOSTING_MODEL"):
    aspnetcore.set("hostingModel", val("SOMEE_HOSTING_MODEL"))

# Sin RID no hay apphost de Windows: IIS debe ejecutar dotnet con el DLL.
if not val("SOMEE_PUBLISH_RID").strip():
    aspnetcore.set("processPath", "dotnet")
    aspnetcore.set("arguments", r".\PuertoTaxi.Api.dll")

envs = aspnetcore.find("environmentVariables")
if envs is None:
    envs = ET.Element("environmentVariables")
    aspnetcore.insert(0, envs)
else:
    for child in list(envs):
        envs.remove(child)

variables = [
    ("ASPNETCORE_ENVIRONMENT", "Production"),
    # Somee termina TLS en su proxy: sin esto UseHttpsRedirection entra en bucle.
    ("ASPNETCORE_FORWARDEDHEADERS_ENABLED", "true"),
    ("ASPNETCORE_ALLOWEDHOSTS", val("SOMEE_ALLOWED_HOSTS")),
    # .NET 10 lee AllowedHosts desde la configuración de la app, no desde el prefijo ASPNETCORE_.
    ("AllowedHosts", val("SOMEE_ALLOWED_HOSTS")),
    ("ConnectionStrings__Default", val("CONNECTION_STRING")),
    ("Jwt__Key", val("JWT_KEY")),
    ("Seed__AdminPassword", val("SEED_ADMIN_PASSWORD")),
    ("Seed__AdminEmail", val("SEED_ADMIN_EMAIL", "admin@puertotaxi.local")),
    ("Seed__AdminPhone", val("SEED_ADMIN_PHONE", "50600000000")),
    ("Seed__DemoData", "false"),
    ("App__AllowedOrigins", val("FRONTEND_ORIGINS")),
    ("App__RequireHttps", "true" if truthy("SOMEE_HTTPS") else "false"),
]

if truthy("SOMEE_HTTPS"):
    variables.append(("ASPNETCORE_HTTPS_PORT", "443"))

for source, target in (
    ("WHATSAPP_PHONE_NUMBER_ID", "WhatsApp__PhoneNumberId"),
    ("WHATSAPP_ACCESS_TOKEN", "WhatsApp__AccessToken"),
    ("WHATSAPP_CENTRAL_PHONE_NUMBER", "WhatsApp__CentralPhoneNumber"),
    ("WHATSAPP_GRAPH_API_VERSION", "WhatsApp__GraphApiVersion"),
    ("WHATSAPP_OTP_TEMPLATE_NAME", "WhatsApp__OtpTemplateName"),
    ("WHATSAPP_OTP_TEMPLATE_LANGUAGE", "WhatsApp__OtpTemplateLanguage"),
):
    if val(source):
        variables.append((target, val(source)))

for name, value in variables:
    ET.SubElement(envs, "environmentVariable", {"name": name, "value": value})

# Log detallado del módulo ANCM (solo para diagnosticar 500.30).
if truthy("SOMEE_ANCM_DEBUG"):
    settings = aspnetcore.find("handlerSettings")
    if settings is None:
        settings = ET.SubElement(aspnetcore, "handlerSettings")
    for child in list(settings):
        settings.remove(child)
    ET.SubElement(settings, "handlerSetting", {
        "name": "debugFile", "value": r".\logs\aspnetcore-debug.log"
    })
    ET.SubElement(settings, "handlerSetting", {
        "name": "debugLevel", "value": "FILE,TRACE"
    })

# WebSockets para SignalR. Solo se activa si el plan de Somee lo soporta.
if truthy("SOMEE_ENABLE_WEBSOCKET"):
    ws = webserver.find("webSocket")
    if ws is None:
        webserver.insert(0, ET.Element("webSocket", {"enabled": "true"}))
    else:
        ws.set("enabled", "true")

if hasattr(ET, "indent"):
    ET.indent(tree, space="  ")
tree.write(path, encoding="utf-8", xml_declaration=True)

print("web.config generado con " + str(len(variables)) + " variables de entorno.")
print("Variables: " + ", ".join(name for name, _ in variables))
PY

echo
echo "Listo: $OUT"
echo "Contenido:"
find "$OUT" -maxdepth 1 -type f -printf '  %f\n' | sort
echo
du -sh "$OUT"

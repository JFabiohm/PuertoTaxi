#!/usr/bin/env bash
# Helpers compartidos por publish.sh y upload.sh.

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# Lee KEY=VALUE sin ejecutar el archivo: no interpreta ';', '$' ni comillas.
load_env() {
  local file="$1" line key value first last
  [[ -f "$file" ]] || fail "Falta $file. Copia production.env.example a .env y rellénalo."

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ -z "${line//[[:space:]]/}" || "$line" == \#* ]]; then
      continue
    fi
    if [[ "$line" != *=* ]]; then
      continue
    fi

    key="${line%%=*}"
    value="${line#*=}"

    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ -z "$key" ]] && continue

    if [[ ${#value} -ge 2 ]]; then
      first="${value:0:1}"
      last="${value: -1}"
      if [[ "$first" == "$last" ]] && { [[ "$first" == '"' ]] || [[ "$first" == "'" ]]; }; then
        value="${value:1:${#value}-2}"
      fi
    fi

    export "$key=$value"
  done < "$file"
}

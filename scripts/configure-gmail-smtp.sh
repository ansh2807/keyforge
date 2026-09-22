#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Keyforge environment file was not found at ${ENV_FILE}." >&2
  exit 1
fi

read -r -p "Gmail address used by the Keyforge administrator: " gmail_address
gmail_address="${gmail_address//[[:space:]]/}"
if [[ ! "${gmail_address}" =~ ^[A-Za-z0-9.!#$%\&\'*+/=?^_\`{|}~-]+@gmail\.com$ ]]; then
  echo "Enter a valid @gmail.com address." >&2
  exit 1
fi

read -r -s -p "Google App Password (input is hidden): " gmail_app_password
echo
gmail_app_password="${gmail_app_password//[[:space:]]/}"
if [[ ! "${gmail_app_password}" =~ ^[A-Za-z0-9]{16,128}$ ]]; then
  echo "The App Password must contain at least 16 letters or digits." >&2
  exit 1
fi

umask 077
temporary_env="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
cleanup() {
  if [[ -n "${temporary_env:-}" && -f "${temporary_env}" ]]; then
    rm -f -- "${temporary_env}"
  fi
}
trap cleanup EXIT

awk '!/^KEYFORGE_SMTP_(HOST|PORT|SECURE|USER|PASSWORD|FROM)=/' "${ENV_FILE}" > "${temporary_env}"
{
  printf '\nKEYFORGE_SMTP_HOST="smtp.gmail.com"\n'
  printf 'KEYFORGE_SMTP_PORT="465"\n'
  printf 'KEYFORGE_SMTP_SECURE="true"\n'
  printf 'KEYFORGE_SMTP_USER="%s"\n' "${gmail_address}"
  printf 'KEYFORGE_SMTP_PASSWORD="%s"\n' "${gmail_app_password}"
  printf 'KEYFORGE_SMTP_FROM="Keyforge <%s>"\n' "${gmail_address}"
} >> "${temporary_env}"

chmod 600 "${temporary_env}"
mv -f -- "${temporary_env}" "${ENV_FILE}"
temporary_env=""
chmod 600 "${ENV_FILE}"

cd "${PROJECT_DIR}"
docker compose --profile public up -d --force-recreate app caddy
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3000/api/health/ready >/dev/null; then
    echo "Gmail delivery is configured and Keyforge is healthy."
    echo "Open Account, send a verification code, and verify it before email login becomes active."
    exit 0
  fi
  sleep 2
done

echo "Keyforge did not become ready after the SMTP update. Check: docker compose logs app" >&2
exit 1

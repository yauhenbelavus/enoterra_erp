#!/bin/bash
set -euo pipefail

SERVER_DIR="/var/www/erp-enoterra/enoterra_erp/deploy/server"
RUN_BACKUP_SH="${SERVER_DIR}/run-backup.sh"
CRON_MARKER="run-backup.sh"

# shellcheck source=/dev/null
. "${SERVER_DIR}/load-node-env.sh"

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab not found — install cron on the VPS first"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found in PATH"
  exit 1
fi

if [ ! -f "${SERVER_DIR}/backup-db.js" ]; then
  echo "backup-db.js not found in ${SERVER_DIR}"
  exit 1
fi

chmod +x "${RUN_BACKUP_SH}"

CRON_JOB="0 2 * * * /bin/sh ${RUN_BACKUP_SH}"
CRON_BLOCK=$(
  cat <<EOF
CRON_TZ=Europe/Warsaw
${CRON_JOB}
EOF
)

EXISTING_CRON="$(crontab -l 2>/dev/null || true)"

if echo "$EXISTING_CRON" | grep -Fq "$CRON_MARKER"; then
  echo "Backup cron job already installed"
  exit 0
fi

{
  if [ -n "$EXISTING_CRON" ]; then
    printf '%s\n' "$EXISTING_CRON"
  fi
  printf '%s\n' "$CRON_BLOCK"
} | crontab -

echo "Backup cron job installed:"
echo "$CRON_BLOCK"

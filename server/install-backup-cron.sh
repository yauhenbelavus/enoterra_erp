#!/bin/bash
set -euo pipefail

SERVER_DIR="/var/www/erp-enoterra/enoterra_erp/deploy/server"
NODE_BIN="$(command -v node || true)"
CRON_MARKER="backup-db.js"

if [ -z "$NODE_BIN" ]; then
  echo "node not found in PATH"
  exit 1
fi

if [ ! -f "${SERVER_DIR}/backup-db.js" ]; then
  echo "backup-db.js not found in ${SERVER_DIR}"
  exit 1
fi

CRON_JOB="0 2 * * * cd ${SERVER_DIR} && ${NODE_BIN} backup-db.js >> ${SERVER_DIR}/backup.log 2>&1"
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

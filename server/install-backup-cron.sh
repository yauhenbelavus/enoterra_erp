#!/bin/bash

SERVER_DIR="/var/www/erp-enoterra/enoterra_erp/deploy/server"
RUN_BACKUP_SH="${SERVER_DIR}/run-backup.sh"
CRON_JOB="0 2 * * * /bin/bash ${RUN_BACKUP_SH}"

# shellcheck source=/dev/null
. "${SERVER_DIR}/load-node-env.sh"

set -euo pipefail

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

CURRENT_CRON="$(crontab -l 2>/dev/null || true)"

if echo "$CURRENT_CRON" | grep -Fq "/bin/bash ${RUN_BACKUP_SH}"; then
  echo "Backup cron job already up to date"
  exit 0
fi

EXISTING_CRON="$(printf '%s\n' "$CURRENT_CRON" | grep -v 'run-backup.sh' | grep -v '^CRON_TZ=Europe/Warsaw$' || true)"

{
  if [ -n "$EXISTING_CRON" ]; then
    printf '%s\n' "$EXISTING_CRON"
  fi
  printf '%s\n' "CRON_TZ=Europe/Warsaw"
  printf '%s\n' "$CRON_JOB"
} | crontab -

echo "Backup cron job installed/updated:"
echo "CRON_TZ=Europe/Warsaw"
echo "$CRON_JOB"

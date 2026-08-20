#!/bin/bash
set -eu

SERVER_DIR="/var/www/erp-enoterra/enoterra_erp/deploy/server"
cd "${SERVER_DIR}"

# shellcheck source=/dev/null
. "${SERVER_DIR}/load-node-env.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "[$(date -Is)] node not found in PATH" >> backup.log
  exit 1
fi

node backup-db.js >> backup.log 2>&1

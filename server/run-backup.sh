#!/bin/sh
cd /var/www/erp-enoterra/enoterra_erp/deploy/server
export PATH="/usr/local/bin:/usr/bin:/bin"
exec node backup-db.js >> backup.log 2>&1

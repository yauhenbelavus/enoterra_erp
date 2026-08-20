#!/usr/bin/env node
require('dotenv').config();

const { runDbBackup } = require('./dbBackup');

runDbBackup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] Backup failed:`, err.message);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Rewrite stored product names with the current toTitleCaseNazwa rule
 * (capital letter after quotes as well as at the start of each word).
 *
 *   node server/rewrite-nazwa-titlecase.js --dry-run
 *   node server/rewrite-nazwa-titlecase.js
 *
 * Updates working_sheets and products. Historical documents (orders, invoices)
 * are left as they were saved.
 */

const path = require('path');
const sqlite3 = require('sqlite3');

const dbPath = path.join(__dirname, 'enoterra_erp.db');
const dryRun = process.argv.includes('--dry-run');

const TABLES = [
  { table: 'working_sheets', idColumn: 'id', nameColumn: 'nazwa' },
  { table: 'products', idColumn: 'id', nameColumn: 'nazwa' },
];

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function close(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()));
  });
}

async function rewriteTable(db, toTitleCaseNazwa, { table, idColumn, nameColumn }) {
  const rows = await all(db, `SELECT ${idColumn} AS id, ${nameColumn} AS nazwa FROM ${table}`);
  const changes = [];

  for (const row of rows) {
    const next = toTitleCaseNazwa(row.nazwa);
    if (!next || next === row.nazwa) continue;
    changes.push({ id: row.id, from: row.nazwa, to: next });
  }

  if (!dryRun) {
    for (const change of changes) {
      await run(
        db,
        `UPDATE ${table} SET ${nameColumn} = ? WHERE ${idColumn} = ?`,
        [change.to, change.id]
      );
    }
  }

  return { scanned: rows.length, updated: changes.length, changes };
}

async function main() {
  const { toTitleCaseNazwa } = await import('./purchaseReceiptValidation.mjs');
  const db = new sqlite3.Database(dbPath);

  try {
    if (!dryRun) await run(db, 'BEGIN');

    const summaries = [];
    for (const spec of TABLES) {
      const result = await rewriteTable(db, toTitleCaseNazwa, spec);
      summaries.push({ table: spec.table, ...result });
    }

    if (!dryRun) await run(db, 'COMMIT');

    for (const summary of summaries) {
      console.log(
        `${dryRun ? '[dry-run] ' : ''}${summary.table}: ${summary.updated} of ${summary.scanned} names change`
      );
      for (const change of summary.changes) {
        console.log(`  #${change.id}: ${change.from} → ${change.to}`);
      }
    }
  } catch (err) {
    if (!dryRun) {
      try {
        await run(db, 'ROLLBACK');
      } catch {
        // ignore rollback errors
      }
    }
    throw err;
  } finally {
    await close(db);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

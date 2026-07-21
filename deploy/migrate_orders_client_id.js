const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const deployDbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
const localDbPath = path.join(__dirname, '..', 'server', 'enoterra_erp.db');
const dbPath = fs.existsSync(deployDbPath) ? deployDbPath : localDbPath;
const reportsDir = path.join(__dirname, 'migration-reports');

console.log('🔄 Starting migration: orders.client_id backfill...');
console.log('📁 Database path:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('❌ Database file not found. Tried:');
  console.error('  -', deployDbPath);
  console.error('  -', localDbPath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function hasColumn(tableName, columnName) {
  return all(`PRAGMA table_info(${tableName})`).then(
    (columns) => columns.some((col) => col.name === columnName)
  );
}

function writeReport(report) {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `orders_client_id_orphans_${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📄 Report saved: ${reportPath}`);
  return reportPath;
}

db.serialize(async () => {
  try {
    await run('PRAGMA foreign_keys = ON');

    const ordersTableExists = await get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='orders'"
    );
    if (!ordersTableExists) {
      throw new Error('Table orders does not exist');
    }

    if (!(await hasColumn('orders', 'client_id'))) {
      console.log('\n📊 Step 1: Adding orders.client_id column...');
      await run('ALTER TABLE orders ADD COLUMN client_id INTEGER');
      console.log('✅ Column client_id added to orders');
    } else {
      console.log('\n⏭️  Step 1: Column client_id already exists in orders');
    }

    await run('CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id)');
    console.log('✅ Index idx_orders_client_id ready');

    const beforeStats = await get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END) AS with_client_id,
        SUM(CASE WHEN client_id IS NULL THEN 1 ELSE 0 END) AS without_client_id
      FROM orders
    `);

    console.log('\n📊 Step 2: Backfilling client_id from klient...');
    const backfillResult = await run(`
      UPDATE orders
      SET client_id = (
        SELECT c.id
        FROM clients c
        WHERE LOWER(TRIM(c.nazwa)) = LOWER(TRIM(orders.klient))
        LIMIT 1
      )
      WHERE client_id IS NULL
    `);
    console.log(`✅ Backfill updated ${backfillResult.changes} order(s)`);

    const orphans = await all(`
      SELECT id, klient, typ, numer_zamowienia, data_utworzenia
      FROM orders
      WHERE client_id IS NULL
      ORDER BY id
    `);

    const afterStats = await get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END) AS with_client_id,
        SUM(CASE WHEN client_id IS NULL THEN 1 ELSE 0 END) AS without_client_id
      FROM orders
    `);

    const veisOrphans = orphans.filter(
      (row) => String(row.klient || '').trim().toUpperCase() === 'VEIS'
    );
    const otherOrphans = orphans.filter(
      (row) => String(row.klient || '').trim().toUpperCase() !== 'VEIS'
    );

    const report = {
      generated_at: new Date().toISOString(),
      database_path: dbPath,
      before: beforeStats,
      backfill_updated: backfillResult.changes,
      after: afterStats,
      orphans_total: orphans.length,
      orphans_veis: veisOrphans.length,
      orphans_other: otherOrphans.length,
      orphans,
      orphans_veis_list: veisOrphans,
      orphans_other_list: otherOrphans,
    };

    console.log('\n📋 Summary:');
    console.log(`  Total orders:              ${afterStats.total}`);
    console.log(`  With client_id:            ${afterStats.with_client_id}`);
    console.log(`  Without client_id:         ${afterStats.without_client_id}`);
    console.log(`  Updated in this run:       ${backfillResult.changes}`);
    console.log(`  Orphans (VEIS):            ${veisOrphans.length}`);
    console.log(`  Orphans (other):           ${otherOrphans.length}`);

    if (orphans.length > 0) {
      console.log('\n⚠️  Orders without client_id:');
      orphans.forEach((row) => {
        console.log(
          `  id=${row.id}  klient="${row.klient}"  typ=${row.typ || 'zamowienie'}  numer=${row.numer_zamowienia}`
        );
      });
      writeReport(report);
    } else {
      console.log('\n✅ No orphan orders — all records have client_id');
      writeReport(report);
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('  1. Review orphan report if any records remain without client_id');
    console.log('  2. Fix VEIS/other orphans manually or create missing clients');
    console.log('  3. Re-run this script to verify orphans list is empty');
    console.log('  4. Continue with migration step 3 (dual write on server)');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('\n🔒 Database connection closed');
      }
    });
  }
});

db.on('error', (err) => {
  console.error('❌ Database error:', err.message);
});

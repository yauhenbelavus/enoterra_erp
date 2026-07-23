const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const deployDbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
const localDbPath = path.join(__dirname, '..', 'server', 'enoterra_erp.db');
const dbPath = fs.existsSync(deployDbPath) ? deployDbPath : localDbPath;
const reportsDir = path.join(__dirname, 'migration-reports');

console.log('🔄 Starting migration: komis.client_id backfill...');
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
  const reportPath = path.join(reportsDir, `komis_client_id_orphans_${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📄 Report saved: ${reportPath}`);
  return reportPath;
}

db.serialize(async () => {
  try {
    await run('PRAGMA foreign_keys = ON');

    const komisTableExists = await get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='komis'"
    );
    if (!komisTableExists) {
      throw new Error('Table komis does not exist');
    }

    if (!(await hasColumn('komis', 'client_id'))) {
      console.log('\n📊 Step 1: Adding komis.client_id column...');
      await run('ALTER TABLE komis ADD COLUMN client_id INTEGER');
      console.log('✅ Column client_id added to komis');
    } else {
      console.log('\n⏭️  Step 1: Column client_id already exists in komis');
    }

    await run('CREATE INDEX IF NOT EXISTS idx_komis_client_id ON komis(client_id)');
    console.log('✅ Index idx_komis_client_id ready');

    const beforeStats = await get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END) AS with_client_id,
        SUM(CASE WHEN client_id IS NULL THEN 1 ELSE 0 END) AS without_client_id
      FROM komis
    `);

    console.log('\n📊 Step 2: Backfilling client_id from klient...');
    const backfillResult = await run(`
      UPDATE komis
      SET client_id = (
        SELECT c.id
        FROM clients c
        WHERE LOWER(TRIM(c.nazwa)) = LOWER(TRIM(komis.klient))
        LIMIT 1
      )
      WHERE client_id IS NULL
    `);
    console.log(`✅ Backfill updated ${backfillResult.changes} komis row(s)`);

    const orphans = await all(`
      SELECT id, klient, kod, nazwa, ilosc
      FROM komis
      WHERE client_id IS NULL
      ORDER BY klient, kod
    `);

    const afterStats = await get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END) AS with_client_id,
        SUM(CASE WHEN client_id IS NULL THEN 1 ELSE 0 END) AS without_client_id
      FROM komis
    `);

    const report = {
      generated_at: new Date().toISOString(),
      database_path: dbPath,
      before: beforeStats,
      backfill_updated: backfillResult.changes,
      after: afterStats,
      orphans_total: orphans.length,
      orphans,
    };

    console.log('\n📋 Summary:');
    console.log(`  Total komis rows:        ${afterStats.total}`);
    console.log(`  With client_id:          ${afterStats.with_client_id}`);
    console.log(`  Without client_id:       ${afterStats.without_client_id}`);
    console.log(`  Updated in this run:     ${backfillResult.changes}`);

    if (orphans.length > 0) {
      console.log('\n⚠️  Komis rows without client_id:');
      orphans.forEach((row) => {
        console.log(
          `  id=${row.id}  klient="${row.klient}"  kod=${row.kod}  ilosc=${row.ilosc}`
        );
      });
      writeReport(report);
    } else {
      console.log('\n✅ No orphan komis rows — all records have client_id');
    }

    console.log('\n✅ Migration completed successfully');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
});

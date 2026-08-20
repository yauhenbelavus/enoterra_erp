const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { uploadBackupToGoogleDrive } = require('./googleDriveBackup');

const RETENTION_DAYS = 7;
const DB_NAME = 'enoterra_erp.db';
const BACKUP_PREFIX = 'enoterra_erp.';
const BACKUP_SUFFIX = '.db';
const BACKUP_PATTERN = /^enoterra_erp\.(\d{4}-\d{2}-\d{2})\.db$/;

const serverDir = __dirname;
const dbPath = path.join(serverDir, DB_NAME);

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function backupFileName(date) {
  return `${BACKUP_PREFIX}${formatDate(date)}${BACKUP_SUFFIX}`;
}

function parseBackupDate(filename) {
  const match = BACKUP_PATTERN.exec(filename);
  if (!match) return null;

  const [year, month, day] = match[1].split('-').map(Number);
  return new Date(year, month - 1, day);
}

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[backup ${timestamp}] ${message}`);
}

function createBackup() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dbPath)) {
      reject(new Error(`Database not found: ${dbPath}`));
      return;
    }

    const backupPath = path.join(serverDir, backupFileName(new Date()));

    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      log(`Removed existing backup for today: ${path.basename(backupPath)}`);
    }

    const db = new sqlite3.Database(dbPath, (openErr) => {
      if (openErr) {
        reject(openErr);
        return;
      }

      const escapedPath = backupPath.replace(/'/g, "''");
      db.run(`VACUUM INTO '${escapedPath}'`, (err) => {
        db.close();

        if (err) {
          if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
          }
          reject(err);
          return;
        }

        log(`Backup created: ${path.basename(backupPath)}`);
        resolve(backupPath);
      });
    });
  });
}

function cleanupOldBackups() {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const files = fs.readdirSync(serverDir);
  let deleted = 0;

  for (const file of files) {
    const backupDate = parseBackupDate(file);
    if (!backupDate || backupDate >= cutoff) {
      continue;
    }

    fs.unlinkSync(path.join(serverDir, file));
    log(`Deleted old backup: ${file}`);
    deleted += 1;
  }

  if (deleted === 0) {
    log(`No backups older than ${RETENTION_DAYS} days to delete`);
  }
}

async function runDbBackup() {
  log(`Starting backup of ${DB_NAME}`);
  const backupPath = await createBackup();
  cleanupOldBackups();

  try {
    await uploadBackupToGoogleDrive(backupPath);
  } catch (err) {
    log(`Google Drive upload failed: ${err.message}`);
  }

  log('Backup finished successfully');
}

module.exports = {
  runDbBackup,
};

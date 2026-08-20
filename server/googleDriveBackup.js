const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const RETENTION_DAYS = 7;
const BACKUP_PATTERN = /^enoterra_erp\.(\d{4}-\d{2}-\d{2})\.db$/;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[backup ${timestamp}] ${message}`);
}

function isGoogleDriveConfigured() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const keyFile = process.env.GOOGLE_DRIVE_KEY_FILE;

  return Boolean(folderId && keyFile && fs.existsSync(keyFile));
}

function parseBackupDate(filename) {
  const match = BACKUP_PATTERN.exec(filename);
  if (!match) return null;

  const [year, month, day] = match[1].split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_DRIVE_KEY_FILE,
    scopes: [DRIVE_SCOPE],
  });

  return google.drive({ version: 'v3', auth });
}

async function findFileByName(drive, folderId, fileName) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return response.data.files?.[0] || null;
}

async function listBackupFiles(drive, folderId) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []).filter((file) => BACKUP_PATTERN.test(file.name));
}

async function uploadBackupToGoogleDrive(backupPath) {
  if (!isGoogleDriveConfigured()) {
    log('Google Drive upload skipped — GOOGLE_DRIVE_FOLDER_ID or GOOGLE_DRIVE_KEY_FILE not configured');
    return;
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const fileName = path.basename(backupPath);
  const drive = getDriveClient();
  const existingFile = await findFileByName(drive, folderId, fileName);

  const media = {
    mimeType: 'application/octet-stream',
    body: fs.createReadStream(backupPath),
  };

  if (existingFile) {
    await drive.files.update({
      fileId: existingFile.id,
      media,
      supportsAllDrives: true,
    });
    log(`Google Drive backup updated: ${fileName}`);
  } else {
    await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media,
      supportsAllDrives: true,
    });
    log(`Google Drive backup uploaded: ${fileName}`);
  }

  await cleanupOldGoogleDriveBackups(drive, folderId);
}

async function cleanupOldGoogleDriveBackups(drive, folderId) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const files = await listBackupFiles(drive, folderId);
  let deleted = 0;

  for (const file of files) {
    const backupDate = parseBackupDate(file.name);
    if (!backupDate || backupDate >= cutoff) {
      continue;
    }

    await drive.files.delete({
      fileId: file.id,
      supportsAllDrives: true,
    });
    log(`Google Drive old backup deleted: ${file.name}`);
    deleted += 1;
  }

  if (deleted === 0) {
    log(`Google Drive: no backups older than ${RETENTION_DAYS} days to delete`);
  }
}

module.exports = {
  uploadBackupToGoogleDrive,
  isGoogleDriveConfigured,
};

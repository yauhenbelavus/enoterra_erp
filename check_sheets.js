import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
console.log('🗄️ Проверка таблиц sheets:', dbPath);

const db = new sqlite3.Database(dbPath);

// Проверяем original_sheets
console.log('\n📋 Original Sheets:');
db.all('SELECT * FROM original_sheets', (err, rows) => {
  if (err) {
    console.error('❌ Ошибка при получении original_sheets:', err.message);
  } else {
    console.log(`   - Количество записей: ${rows.length}`);
    if (rows.length > 0) {
      console.log('   - Первая запись:');
      console.log('     ID:', rows[0].id);
      console.log('     File Name:', rows[0].file_name);
      console.log('     Data (первые 200 символов):', rows[0].data ? rows[0].data.substring(0, 200) + '...' : 'null');
      console.log('     Created At:', rows[0].created_at);
    }
  }
  
  // Проверяем working_sheets
  console.log('\n📋 Working Sheets:');
  db.all('SELECT * FROM working_sheets', (err, workingRows) => {
    if (err) {
      console.error('❌ Ошибка при получении working_sheets:', err.message);
    } else {
      console.log(`   - Количество записей: ${workingRows.length}`);
      if (workingRows.length > 0) {
        console.log('   - Первые 3 записи:');
        workingRows.slice(0, 3).forEach((row, index) => {
          console.log(`     ${index + 1}. ID: ${row.id}, Data: ${row.data}, Kod: ${row.kod}, Nazwa: ${row.nazwa}, Ilosc: ${row.ilosc}, Typ: ${row.typ}`);
        });
      }
    }
    
    console.log('\n🏁 Проверка завершена');
    db.close();
  });
});

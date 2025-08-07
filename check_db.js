import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
console.log('🗄️ Проверка базы данных:', dbPath);

const db = new sqlite3.Database(dbPath);

// Проверяем существование файла
import fs from 'fs';
if (fs.existsSync(dbPath)) {
  console.log('✅ Файл базы данных существует');
  console.log('📊 Размер файла:', fs.statSync(dbPath).size, 'байт');
} else {
  console.log('❌ Файл базы данных не найден');
  process.exit(1);
}

// Получаем список таблиц
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('❌ Ошибка при получении таблиц:', err.message);
    return;
  }
  
  console.log('📋 Таблицы в базе данных:');
  if (tables.length === 0) {
    console.log('   - База данных пуста (нет таблиц)');
  } else {
    tables.forEach(table => {
      console.log(`   - ${table.name}`);
    });
  }
  
  // Проверяем количество записей в каждой таблице
  if (tables.length > 0) {
    console.log('\n📈 Количество записей в таблицах:');
    let completedQueries = 0;
    
    tables.forEach(table => {
      db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
        if (err) {
          console.error(`❌ Ошибка при проверке ${table.name}:`, err.message);
        } else {
          console.log(`   - ${table.name}: ${row.count} записей`);
        }
        
        completedQueries++;
        if (completedQueries === tables.length) {
          console.log('\n🏁 Проверка завершена');
          db.close();
        }
      });
    });
  } else {
    console.log('\n🏁 База данных пуста');
    db.close();
  }
});


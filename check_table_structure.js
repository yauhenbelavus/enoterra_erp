import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
console.log('🗄️ Проверка структуры таблиц:', dbPath);

const db = new sqlite3.Database(dbPath);

// Получаем список всех таблиц
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('❌ Ошибка при получении таблиц:', err.message);
    return;
  }
  
  console.log('📋 Таблицы в базе данных:');
  tables.forEach(table => {
    console.log(`   - ${table.name}`);
  });
  
  // Проверяем структуру каждой таблицы
  let completedQueries = 0;
  
  tables.forEach(table => {
    db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
      if (err) {
        console.error(`❌ Ошибка при получении структуры ${table.name}:`, err.message);
      } else {
        console.log(`\n📊 Структура таблицы ${table.name}:`);
        columns.forEach(col => {
          console.log(`   - ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
        });
      }
      
      completedQueries++;
      if (completedQueries === tables.length) {
        console.log('\n🏁 Проверка структуры завершена');
        db.close();
      }
    });
  });
});

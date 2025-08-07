import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
console.log('🗄️ Проверка структуры таблицы products:', dbPath);

const db = new sqlite3.Database(dbPath);

// Проверяем структуру таблицы products
console.log('\n📊 Структура таблицы products:');
db.all('PRAGMA table_info(products)', (err, columns) => {
  if (err) {
    console.error('❌ Ошибка при получении структуры products:', err.message);
  } else {
    console.log('   Колонки:');
    columns.forEach(col => {
      console.log(`   - ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
  }
  
  // Проверяем данные в таблице
  console.log('\n📋 Данные в таблице products:');
  db.all('SELECT * FROM products LIMIT 5', (err, rows) => {
    if (err) {
      console.error('❌ Ошибка при получении данных products:', err.message);
    } else {
      console.log(`   - Количество записей: ${rows.length}`);
      if (rows.length > 0) {
        console.log('   - Первая запись:');
        Object.keys(rows[0]).forEach(key => {
          console.log(`     ${key}: ${rows[0][key]}`);
        });
      }
    }
    
    console.log('\n🏁 Проверка завершена');
    db.close();
  });
});

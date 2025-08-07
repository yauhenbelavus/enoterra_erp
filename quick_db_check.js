const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Быстрая проверка базы данных...');
console.log('📍 Файл:', dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('❌ Ошибка:', err);
    return;
  }
  
  console.log(`\n✅ Найдено таблиц: ${tables.length}`);
  console.log('📋 Список таблиц:');
  tables.forEach(table => {
    console.log(`  - ${table.name}`);
  });
  
  // Проверяем количество записей в каждой таблице
  let completed = 0;
  tables.forEach(table => {
    db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
      if (err) {
        console.log(`  ❌ ${table.name}: ошибка`);
      } else {
        console.log(`  📊 ${table.name}: ${row.count} записей`);
      }
      completed++;
      
      if (completed === tables.length) {
        console.log('\n🎉 Проверка завершена!');
        db.close();
      }
    });
  });
});

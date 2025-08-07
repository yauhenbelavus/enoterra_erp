import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Пути к файлам (серверная структура)
const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
const sqlPath = path.join(__dirname, 'database_schema.sql');

console.log('🗄️ Инициализация базы данных EnoTerra ERP');
console.log('📂 База данных:', dbPath);
console.log('📝 SQL файл:', sqlPath);

// Проверяем существование SQL файла
if (!fs.existsSync(sqlPath)) {
  console.error('❌ Файл database_schema.sql не найден!');
  console.log('📋 Убедитесь, что файл database_schema.sql находится в корне проекта');
  process.exit(1);
}

// Создаем папку server если её нет
const serverDir = path.dirname(dbPath);
if (!fs.existsSync(serverDir)) {
  fs.mkdirSync(serverDir, { recursive: true });
  console.log('📁 Создана папка server');
}

// Читаем SQL файл
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

// Создаем подключение к базе данных
const db = new sqlite3.Database(dbPath);

console.log('🔧 Создание таблиц и индексов...');

// Выполняем SQL скрипт
db.exec(sqlContent, (err) => {
  if (err) {
    console.error('❌ Ошибка при создании базы данных:', err.message);
    db.close();
    process.exit(1);
  }
  
  console.log('✅ База данных успешно инициализирована!');
  console.log('📊 Файл базы данных создан:', dbPath);
  
  // Проверяем созданные таблицы
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error('❌ Ошибка при получении списка таблиц:', err.message);
    } else {
      console.log('📋 Созданные таблицы:');
      tables.forEach(table => {
        console.log(`   - ${table.name}`);
      });
    }
    
    // Проверяем количество записей в основных таблицах
    const checkQueries = [
      'SELECT COUNT(*) as count FROM products',
      'SELECT COUNT(*) as count FROM clients',
      'SELECT COUNT(*) as count FROM orders',
      'SELECT COUNT(*) as count FROM order_products',
      'SELECT COUNT(*) as count FROM working_sheets',
      'SELECT COUNT(*) as count FROM product_receipts',
      'SELECT COUNT(*) as count FROM original_sheets',
      'SELECT COUNT(*) as count FROM price_history',
      'SELECT COUNT(*) as count FROM product_prices'
    ];
    
    const tableNames = [
      'products', 'clients', 'orders', 'order_products', 
      'working_sheets', 'product_receipts', 'original_sheets', 
      'price_history', 'product_prices'
    ];
    
    console.log('📈 Количество записей в таблицах:');
    
    let completedQueries = 0;
    checkQueries.forEach((query, index) => {
      db.get(query, (err, row) => {
        if (err) {
          console.error(`❌ Ошибка при проверке ${tableNames[index]}:`, err.message);
        } else {
          console.log(`   - ${tableNames[index]}: ${row.count} записей`);
        }
        
        completedQueries++;
        if (completedQueries === checkQueries.length) {
          console.log('');
          console.log('🎉 Инициализация завершена!');
          console.log('🚀 Теперь можно запускать сервер:');
          console.log('   node server/index.js');
          console.log('');
          console.log('📊 База данных готова к использованию');
          console.log('📍 Расположение: server/enoterra_erp.db');
          db.close();
        }
      });
    });
  });
});

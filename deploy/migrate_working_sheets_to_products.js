const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Путь к базе данных
const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');

console.log('🔄 Starting migration: Create initial products records from working_sheets...');
console.log('📁 Database path:', dbPath);

// Проверяем существование файла базы данных
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  console.error('❌ Database file not found:', dbPath);
  process.exit(1);
}

// Подключаемся к базе данных
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Выполняем миграцию
db.serialize(() => {
  console.log('🔄 Starting migration process...');
  
  // 1. Находим все товары в working_sheets
  console.log('📊 Finding all products in working_sheets...');
  db.all('SELECT * FROM working_sheets WHERE archived = 0', (err, workingSheets) => {
    if (err) {
      console.error('❌ Error reading working_sheets:', err.message);
      db.close();
      return;
    }
    
    console.log(`✅ Found ${workingSheets.length} products in working_sheets`);
    
    if (workingSheets.length === 0) {
      console.log('ℹ️ No products to migrate');
      db.close();
      return;
    }
    
    let processedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;
    
    // 2. Для каждого товара проверяем, есть ли он в products
    workingSheets.forEach((ws) => {
      db.get('SELECT COUNT(*) as count FROM products WHERE kod = ?', [ws.kod], (err, row) => {
        if (err) {
          console.error(`❌ Error checking product ${ws.kod}:`, err.message);
          processedCount++;
          checkCompletion();
          return;
        }
        
        if (row.count > 0) {
          // Товар уже есть в products - пропускаем
          console.log(`⏭️  Skipping ${ws.kod} - already exists in products (${row.count} records)`);
          skippedCount++;
          processedCount++;
          checkCompletion();
        } else {
          // Товара нет в products - создаём запись
          console.log(`➕ Creating initial product record for ${ws.kod} (${ws.nazwa})`);
          
          // Устанавливаем дату 05.05.2025, чтобы эти товары имели определённую дату создания
          const migrationDate = '2025-05-05 00:00:00';
          
          db.run(
            `INSERT INTO products (kod, nazwa, kod_kreskowy, cena, ilosc, ilosc_aktualna, receipt_id, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
            [
              ws.kod,
              ws.nazwa,
              ws.kod_kreskowy || null,
              ws.cena || 0,
              ws.ilosc || 0,
              ws.ilosc || 0,
              migrationDate
            ],
            function(err) {
              if (err) {
                console.error(`❌ Error creating product ${ws.kod}:`, err.message);
              } else {
                console.log(`✅ Created product ${ws.kod} with ID: ${this.lastID}`);
                createdCount++;
              }
              processedCount++;
              checkCompletion();
            }
          );
        }
      });
    });
    
    function checkCompletion() {
      if (processedCount === workingSheets.length) {
        console.log('\n🎉 Migration completed!');
        console.log(`📊 Statistics:`);
        console.log(`  - Total products in working_sheets: ${workingSheets.length}`);
        console.log(`  - Created in products: ${createdCount}`);
        console.log(`  - Skipped (already exist): ${skippedCount}`);
        
        // Проверяем результат
        db.all('SELECT kod, COUNT(*) as count FROM products GROUP BY kod HAVING count > 1', (err, duplicates) => {
          if (err) {
            console.error('❌ Error checking duplicates:', err.message);
          } else if (duplicates.length > 0) {
            console.log('\n⚠️  Warning: Found products with multiple records (this is normal for products with multiple receipts):');
            duplicates.forEach(dup => {
              console.log(`  - ${dup.kod}: ${dup.count} records`);
            });
          }
          
          // Закрываем соединение
          db.close((err) => {
            if (err) {
              console.error('❌ Error closing database:', err.message);
            } else {
              console.log('\n🔒 Database connection closed');
            }
            console.log('\n📝 Next steps:');
            console.log('  1. Verify the migration by checking Historia cen in the UI');
            console.log('  2. All products from working_sheets should now have initial price history');
            console.log('  3. Future receipts will add new records to products table');
          });
        });
      }
    }
  });
});

// Обработка ошибок
db.on('error', (err) => {
  console.error('❌ Database error:', err.message);
});


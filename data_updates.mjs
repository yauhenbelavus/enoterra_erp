import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

console.log('🗄️ Database path:', dbPath);

// Функция для выполнения обновления
async function runUpdate(updateName, updateFunction) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 Running update: ${updateName}`);
    updateFunction(db, resolve, reject);
  });
}

// Обновление 1: Обновление EAN в kod_kreskowy
function updateEanToKodKreskowy(db, resolve, reject) {
  console.log('Updating EAN to kod_kreskowy in products table...');
  
  db.all("SELECT id, ean FROM products WHERE ean IS NOT NULL AND ean != ''", [], (err, rows) => {
    if (err) {
      console.error('❌ Error selecting products:', err);
      reject(err);
      return;
    }
    
    console.log(`Found ${rows.length} products with EAN codes`);
    
    let updatedCount = 0;
    let errorCount = 0;
    
    if (rows.length === 0) {
      console.log('ℹ️ No products with EAN codes found');
      resolve();
      return;
    }
    
    rows.forEach((row, index) => {
      db.run("UPDATE products SET kod_kreskowy = ? WHERE id = ?", [row.ean, row.id], (err) => {
        if (err) {
          console.error(`❌ Error updating product ${row.id}:`, err);
          errorCount++;
        } else {
          updatedCount++;
        }
        
        if (index === rows.length - 1) {
          console.log(`✅ Updated ${updatedCount} products, ${errorCount} errors`);
          resolve();
        }
      });
    });
  });
}

// Обновление 2: Обновление kod_kreskowy в order_products
function updateKodKreskowyInOrderProducts(db, resolve, reject) {
  console.log('Updating kod_kreskowy in order_products table...');
  
  db.all("SELECT op.id, p.kod_kreskowy FROM order_products op JOIN products p ON op.product_id = p.id WHERE p.kod_kreskowy IS NOT NULL", [], (err, rows) => {
    if (err) {
      console.error('❌ Error selecting order_products:', err);
      reject(err);
      return;
    }
    
    console.log(`Found ${rows.length} order_products to update`);
    
    let updatedCount = 0;
    let errorCount = 0;
    
    if (rows.length === 0) {
      console.log('ℹ️ No order_products to update');
      resolve();
      return;
    }
    
    rows.forEach((row, index) => {
      db.run("UPDATE order_products SET kod_kreskowy = ? WHERE id = ?", [row.kod_kreskowy, row.id], (err) => {
        if (err) {
          console.error(`❌ Error updating order_product ${row.id}:`, err);
          errorCount++;
        } else {
          updatedCount++;
        }
        
        if (index === rows.length - 1) {
          console.log(`✅ Updated ${updatedCount} order_products, ${errorCount} errors`);
          resolve();
        }
      });
    });
  });
}

// Обновление 3: Замена kod на kod_kreskowy
function replaceKodWithKodKreskowy(db, resolve, reject) {
  console.log('Replacing kod with kod_kreskowy in products table...');
  
  db.all("SELECT id, kod FROM products WHERE kod IS NOT NULL AND kod != ''", [], (err, rows) => {
    if (err) {
      console.error('❌ Error selecting products:', err);
      reject(err);
      return;
    }
    
    console.log(`Found ${rows.length} products with kod codes`);
    
    let updatedCount = 0;
    let errorCount = 0;
    
    if (rows.length === 0) {
      console.log('ℹ️ No products with kod codes found');
      resolve();
      return;
    }
    
    rows.forEach((row, index) => {
      db.run("UPDATE products SET kod_kreskowy = ? WHERE id = ?", [row.kod, row.id], (err) => {
        if (err) {
          console.error(`❌ Error updating product ${row.id}:`, err);
          errorCount++;
        } else {
          updatedCount++;
        }
        
        if (index === rows.length - 1) {
          console.log(`✅ Updated ${updatedCount} products, ${errorCount} errors`);
          resolve();
        }
      });
    });
  });
}

// Обновление 4: Замена id_klienta на klient
function replaceIdKlientaWithKlient(db, resolve, reject) {
  console.log('Replacing id_klienta with klient in orders table...');
  
  db.all("SELECT o.id, c.nazwa FROM orders o JOIN clients c ON o.id_klienta = c.id", [], (err, rows) => {
    if (err) {
      console.error('❌ Error selecting orders:', err);
      reject(err);
      return;
    }
    
    console.log(`Found ${rows.length} orders to update`);
    
    let updatedCount = 0;
    let errorCount = 0;
    
    if (rows.length === 0) {
      console.log('ℹ️ No orders to update');
      resolve();
      return;
    }
    
    rows.forEach((row, index) => {
      db.run("UPDATE orders SET klient = ? WHERE id = ?", [row.nazwa, row.id], (err) => {
        if (err) {
          console.error(`❌ Error updating order ${row.id}:`, err);
          errorCount++;
        } else {
          updatedCount++;
        }
        
        if (index === rows.length - 1) {
          console.log(`✅ Updated ${updatedCount} orders, ${errorCount} errors`);
          resolve();
        }
      });
    });
  });
}

// Главная функция выполнения всех обновлений
async function runAllUpdates() {
  try {
    console.log('🚀 Starting data updates...');
    
    await runUpdate('Update EAN to Kod Kreskowy', updateEanToKodKreskowy);
    await runUpdate('Update Kod Kreskowy in Order Products', updateKodKreskowyInOrderProducts);
    await runUpdate('Replace Kod with Kod Kreskowy', replaceKodWithKodKreskowy);
    await runUpdate('Replace ID Klienta with Klient', replaceIdKlientaWithKlient);
    
    console.log('\n✅ All updates completed successfully!');
    
  } catch (error) {
    console.error('❌ Updates failed:', error);
  } finally {
    db.close();
  }
}

// Запускаем обновления
runAllUpdates(); 
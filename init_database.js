// Скрипт для инициализации базы данных с тестовыми данными
const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

console.log('🗄️ Инициализация базы данных:', dbPath);

// Тестовые данные
const testData = {
  products: [
    ['Laptop Dell XPS 13', 'Elektronika', 4500.00, 5, '2025-12-31', 'LAP001'],
    ['iPhone 15 Pro', 'Telefony', 3200.00, 8, '2025-10-15', 'PHN001'],
    ['Monitor Samsung 27"', 'Elektronika', 1200.00, 12, '2026-03-20', 'MON001'],
    ['Klawiatura mechaniczna', 'Akcesoria', 350.00, 25, '2025-08-30', 'KBD001'],
    ['Mysz bezprzewodowa', 'Akcesoria', 120.00, 30, '2025-07-15', 'MOU001'],
    ['Dysk SSD 1TB', 'Komponenty', 450.00, 15, '2025-11-30', 'SSD001'],
    ['Pamięć RAM 16GB', 'Komponenty', 280.00, 20, '2025-09-20', 'RAM001'],
    ['Kamera internetowa', 'Akcesoria', 180.00, 18, '2025-06-10', 'CAM001']
  ],
  clients: [
    ['Firma ABC Sp. z o.o.', 'abc@firma.pl', '+48 123 456 789', 'ul. Przykładowa 1, Warszawa'],
    ['Sklep XYZ', 'sklep@xyz.pl', '+48 987 654 321', 'ul. Handlowa 15, Kraków'],
    ['Biuro IT Solutions', 'kontakt@itsolutions.pl', '+48 555 123 456', 'ul. Techniczna 8, Wrocław'],
    ['Centrum Komputerowe', 'info@centrum.pl', '+48 777 888 999', 'ul. Elektroniczna 22, Gdańsk']
  ],
  orders: [
    ['ORD-2024-001', '2024-01-15', 'Firma ABC Sp. z o.o.', 'completed'],
    ['ORD-2024-002', '2024-01-20', 'Sklep XYZ', 'pending'],
    ['ORD-2024-003', '2024-01-25', 'Biuro IT Solutions', 'processing']
  ],
  receipts: [
    [1, 'Dostawca Tech', '2024-01-10', 10, 4200.00, 'FAK-2024-001', 'Dostawa laptopów'],
    [2, 'Mobile Solutions', '2024-01-12', 15, 3000.00, 'FAK-2024-002', 'Telefony iPhone'],
    [3, 'Monitor Plus', '2024-01-14', 20, 1100.00, 'FAK-2024-003', 'Monitory Samsung']
  ]
};

// Функция для добавления данных
function insertData(table, data, callback) {
  let completed = 0;
  const total = data.length;
  
  data.forEach((item, index) => {
    let sql, params;
    
    switch(table) {
      case 'products':
        sql = 'INSERT INTO products (nazwa, kategoria, cena, stan, data_waznosci, kod_produktu) VALUES (?, ?, ?, ?, ?, ?)';
        params = item;
        break;
      case 'clients':
        sql = 'INSERT INTO clients (nazwa, email, telefon, adres) VALUES (?, ?, ?, ?)';
        params = item;
        break;
      case 'orders':
        sql = 'INSERT INTO orders (numer_zamowienia, data_zamowienia, klient, status) VALUES (?, ?, ?, ?)';
        params = item;
        break;
      case 'receipts':
        sql = 'INSERT INTO product_receipts (product_id, sprzedawca, data_przyjecia, ilosc, cena_jednostkowa, numer_faktury, uwagi) VALUES (?, ?, ?, ?, ?, ?, ?)';
        params = item;
        break;
    }
    
    db.run(sql, params, function(err) {
      if (err) {
        console.error(`❌ Ошибка добавления ${table}:`, err.message);
      } else {
        console.log(`✅ ${table} ${index + 1} добавлен`);
      }
      
      completed++;
      if (completed === total) {
        callback();
      }
    });
  });
}

// Основной процесс инициализации
db.serialize(() => {
  console.log('📋 Добавляем тестовые данные...');
  
  // Добавляем продукты
  insertData('products', testData.products, () => {
    console.log('✅ Продукты добавлены');
    
    // Добавляем клиентов
    insertData('clients', testData.clients, () => {
      console.log('✅ Клиенты добавлены');
      
      // Добавляем заказы
      insertData('orders', testData.orders, () => {
        console.log('✅ Заказы добавлены');
        
        // Добавляем приемки
        insertData('receipts', testData.receipts, () => {
          console.log('✅ Приемки добавлены');
          
          console.log('🎉 База данных инициализирована!');
          console.log('📊 Статистика:');
          
          // Показываем статистику
          db.all('SELECT COUNT(*) as count FROM products', (err, rows) => {
            if (!err) console.log(`   - Продукты: ${rows[0].count}`);
          });
          
          db.all('SELECT COUNT(*) as count FROM clients', (err, rows) => {
            if (!err) console.log(`   - Клиенты: ${rows[0].count}`);
          });
          
          db.all('SELECT COUNT(*) as count FROM orders', (err, rows) => {
            if (!err) console.log(`   - Заказы: ${rows[0].count}`);
          });
          
          db.all('SELECT COUNT(*) as count FROM product_receipts', (err, rows) => {
            if (!err) console.log(`   - Приемки: ${rows[0].count}`);
          });
          
          db.close();
        });
      });
    });
  });
});

// Скрипт для восстановления базы данных EnoTerra ERP
const sqlite3 = require('sqlite3');
const path = require('path');

// Создаем базу данных
const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

console.log('🗄️ Создаем базу данных:', dbPath);

// Инициализируем таблицы
db.serialize(() => {
  console.log('📋 Создаем таблицы...');
  
  // Таблица продуктов
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nazwa TEXT NOT NULL,
    kategoria TEXT,
    cena REAL,
    stan INTEGER DEFAULT 0,
    data_waznosci TEXT,
    kod_produktu TEXT UNIQUE
  )`);

  // Таблица заказов
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numer_zamowienia TEXT UNIQUE,
    data_zamowienia TEXT,
    klient TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Таблица позиций заказов
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_id INTEGER,
    ilosc INTEGER,
    cena REAL,
    FOREIGN KEY (order_id) REFERENCES orders (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
  )`);

  // Таблица клиентов
  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nazwa TEXT NOT NULL,
    email TEXT,
    telefon TEXT,
    adres TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Таблица приемок товаров
  db.run(`CREATE TABLE IF NOT EXISTS product_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    sprzedawca TEXT,
    data_przyjecia TEXT,
    ilosc INTEGER,
    cena_jednostkowa REAL,
    numer_faktury TEXT,
    uwagi TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id)
  )`);

  console.log('✅ Таблицы созданы');

  // Добавляем тестовые данные
  console.log('📝 Добавляем тестовые данные...');

  // Тестовые продукты
  const testProducts = [
    ['Laptop Dell XPS 13', 'Elektronika', 4500.00, 5, '2025-12-31', 'LAP001'],
    ['iPhone 15 Pro', 'Telefony', 3200.00, 8, '2025-10-15', 'PHN001'],
    ['Monitor Samsung 27"', 'Elektronika', 1200.00, 12, '2026-03-20', 'MON001'],
    ['Klawiatura mechaniczna', 'Akcesoria', 350.00, 25, '2025-08-30', 'KBD001'],
    ['Mysz bezprzewodowa', 'Akcesoria', 120.00, 30, '2025-07-15', 'MOU001'],
    ['Dysk SSD 1TB', 'Komponenty', 450.00, 15, '2025-11-30', 'SSD001'],
    ['Pamięć RAM 16GB', 'Komponenty', 280.00, 20, '2025-09-20', 'RAM001'],
    ['Kamera internetowa', 'Akcesoria', 180.00, 18, '2025-06-10', 'CAM001']
  ];

  testProducts.forEach((product, index) => {
    db.run(
      'INSERT INTO products (nazwa, kategoria, cena, stan, data_waznosci, kod_produktu) VALUES (?, ?, ?, ?, ?, ?)',
      product,
      function(err) {
        if (err) {
          console.error('❌ Ошибка добавления продукта:', err.message);
        } else {
          console.log(`✅ Продукт ${index + 1} добавлен: ${product[0]}`);
        }
      }
    );
  });

  // Тестовые клиенты
  const testClients = [
    ['Firma ABC Sp. z o.o.', 'abc@firma.pl', '+48 123 456 789', 'ul. Przykładowa 1, Warszawa'],
    ['Sklep XYZ', 'sklep@xyz.pl', '+48 987 654 321', 'ul. Handlowa 15, Kraków'],
    ['Biuro IT Solutions', 'kontakt@itsolutions.pl', '+48 555 123 456', 'ul. Techniczna 8, Wrocław'],
    ['Centrum Komputerowe', 'info@centrum.pl', '+48 777 888 999', 'ul. Elektroniczna 22, Gdańsk']
  ];

  testClients.forEach((client, index) => {
    db.run(
      'INSERT INTO clients (nazwa, email, telefon, adres) VALUES (?, ?, ?, ?)',
      client,
      function(err) {
        if (err) {
          console.error('❌ Ошибка добавления клиента:', err.message);
        } else {
          console.log(`✅ Клиент ${index + 1} добавлен: ${client[0]}`);
        }
      }
    );
  });

  // Тестовые заказы
  const testOrders = [
    ['ORD-2024-001', '2024-01-15', 'Firma ABC Sp. z o.o.', 'completed'],
    ['ORD-2024-002', '2024-01-20', 'Sklep XYZ', 'pending'],
    ['ORD-2024-003', '2024-01-25', 'Biuro IT Solutions', 'processing']
  ];

  testOrders.forEach((order, index) => {
    db.run(
      'INSERT INTO orders (numer_zamowienia, data_zamowienia, klient, status) VALUES (?, ?, ?, ?)',
      order,
      function(err) {
        if (err) {
          console.error('❌ Ошибка добавления заказа:', err.message);
        } else {
          console.log(`✅ Заказ ${index + 1} добавлен: ${order[0]}`);
        }
      }
    );
  });

  // Тестовые приемки
  const testReceipts = [
    [1, 'Dostawca Tech', '2024-01-10', 10, 4200.00, 'FAK-2024-001', 'Dostawa laptopów'],
    [2, 'Mobile Solutions', '2024-01-12', 15, 3000.00, 'FAK-2024-002', 'Telefony iPhone'],
    [3, 'Monitor Plus', '2024-01-14', 20, 1100.00, 'FAK-2024-003', 'Monitory Samsung']
  ];

  testReceipts.forEach((receipt, index) => {
    db.run(
      'INSERT INTO product_receipts (product_id, sprzedawca, data_przyjecia, ilosc, cena_jednostkowa, numer_faktury, uwagi) VALUES (?, ?, ?, ?, ?, ?, ?)',
      receipt,
      function(err) {
        if (err) {
          console.error('❌ Ошибка добавления приемки:', err.message);
        } else {
          console.log(`✅ Приемка ${index + 1} добавлена: ${receipt[5]}`);
        }
      }
    );
  });

  console.log('🎉 База данных восстановлена с тестовыми данными!');
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

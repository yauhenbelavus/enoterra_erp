const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Логирование всех запросов для отладки
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Заменяем пробелы на подчеркивания для избежания проблем с URL
    const safeName = file.originalname.replace(/\s+/g, '_');
    // Добавляем случайный компонент для избежания конфликтов при одновременной загрузке
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    cb(null, Date.now() + '-' + randomSuffix + '-' + safeName);
  }
});

const upload = multer({ storage: storage });

// Serve uploaded files from uploads directory (ДОЛЖЕН БЫТЬ ПЕРЕД ВСЕМИ API endpoints)
app.use('/uploads', (req, res, next) => {
  console.log(`📁 Uploads middleware: ${req.method} ${req.url}`);
  console.log(`📁 Looking for file: ${path.join(__dirname, 'uploads', req.url)}`);
  
  // Проверяем существование файла
  const filePath = path.join(__dirname, 'uploads', req.url);
  if (fs.existsSync(filePath)) {
    console.log(`✅ File exists: ${filePath}`);
    // Устанавливаем заголовки для PDF
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
    // Отправляем файл
    res.sendFile(filePath);
  } else {
    console.log(`❌ File not found: ${filePath}`);
    res.status(404).json({ error: 'File not found', path: filePath });
  }
});

// Database setup
const dbPath = path.join(__dirname, 'enoterra_erp.db');
const db = new sqlite3.Database(dbPath);

// Устанавливаем таймаут для операций с базой данных
db.configure('busyTimeout', 30000); // 30 секунд

// Database initialization
db.serialize(() => {
  // Включаем поддержку внешних ключей
  db.run('PRAGMA foreign_keys = ON', (err) => {
    if (err) {
      console.error('❌ Error enabling foreign keys:', err);
    } else {
      console.log('✅ Foreign keys enabled');
    }
  });
  
  console.log('🗄️ Initializing database...');
  
  // Таблица клиентов
  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nazwa TEXT NOT NULL,
    firma TEXT,
    adres TEXT,
    kontakt TEXT,
    czas_dostawy TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating clients table:', err);
    } else {
      console.log('✅ Clients table ready');
    }
  });

  // Таблица продуктов
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    kod_kreskowy TEXT,
    cena REAL DEFAULT 0,
    ilosc INTEGER DEFAULT 0,
    ilosc_aktualna INTEGER DEFAULT 0,
    receipt_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receipt_id) REFERENCES product_receipts (id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating products table:', err);
    } else {
      console.log('✅ Products table ready');
    }
  });

  // Таблица заказов
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    klient TEXT NOT NULL,
    numer_zamowienia TEXT NOT NULL,
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    laczna_ilosc INTEGER DEFAULT 0,
    typ TEXT DEFAULT 'zamowienie',
    numer_zwrotu TEXT
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating orders table:', err);
    } else {
      console.log('✅ Orders table ready');
    }
  });

  // Таблица продуктов заказов
  db.run(`CREATE TABLE IF NOT EXISTS order_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId INTEGER NOT NULL,
    product_id INTEGER,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    kod_kreskowy TEXT,
    ilosc INTEGER NOT NULL,
    typ TEXT DEFAULT 'sprzedaz',
    product_kod TEXT,
    powod_zwrotu TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orderId) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating order_products table:', err);
    } else {
      console.log('✅ Order products table ready');
      
      // Миграция: удаляем колонку powod_odpisania если она существует
      db.all("PRAGMA table_info(order_products)", (err, columns) => {
        if (err) {
          console.error('❌ Error checking order_products table structure:', err);
          return;
        }
        
        const hasPowodOdpisania = columns.some(col => col.name === 'powod_odpisania');
        
        if (hasPowodOdpisania) {
          console.log('🔄 Migrating order_products table: removing powod_odpisania column...');
          
          // Удаляем временную таблицу если она существует (на случай прерванной миграции)
          db.run(`DROP TABLE IF EXISTS order_products_new`, (dropErr) => {
            if (dropErr && !dropErr.message.includes('no such table')) {
              console.error('❌ Error dropping temp table:', dropErr);
              return;
            }
            
            // Создаем временную таблицу без колонки powod_odpisania
            db.run(`
              CREATE TABLE order_products_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                orderId INTEGER NOT NULL,
                product_id INTEGER,
                kod TEXT NOT NULL,
                nazwa TEXT NOT NULL,
                kod_kreskowy TEXT,
                ilosc INTEGER NOT NULL,
                typ TEXT DEFAULT 'sprzedaz',
                product_kod TEXT,
                powod_zwrotu TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (orderId) REFERENCES orders (id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
              )
            `, (err) => {
              if (err) {
                console.error('❌ Error creating new order_products table:', err);
                return;
              }
              
              // Копируем данные из старой таблицы в новую
              db.run(`
                INSERT INTO order_products_new 
                (id, orderId, product_id, kod, nazwa, kod_kreskowy, ilosc, typ, product_kod, powod_zwrotu, created_at)
                SELECT 
                  id, orderId, product_id, kod, nazwa, kod_kreskowy, ilosc, typ, product_kod, powod_zwrotu, created_at
                FROM order_products
              `, (err) => {
                if (err) {
                  console.error('❌ Error copying data to new table:', err);
                  // Удаляем временную таблицу при ошибке
                  db.run(`DROP TABLE IF EXISTS order_products_new`);
                  return;
                }
                
                // Удаляем старую таблицу
                db.run(`DROP TABLE order_products`, (err) => {
                  if (err) {
                    console.error('❌ Error dropping old table:', err);
                    // Удаляем временную таблицу при ошибке
                    db.run(`DROP TABLE IF EXISTS order_products_new`);
                    return;
                  }
                  
                  // Переименовываем новую таблицу
                  db.run(`ALTER TABLE order_products_new RENAME TO order_products`, (err) => {
                    if (err) {
                      console.error('❌ Error renaming table:', err);
                      return;
                    }
                    
                    console.log('✅ Column powod_odpisania removed from order_products');
                  });
                });
              });
            });
          });
        } else {
          console.log('✅ Column powod_odpisania does not exist in order_products (migration not needed)');
        }
      });
    }
  });

  // Миграция: удаляем устаревшие таблицы writeoffs и writeoff_products (если существуют)
  db.run(`DROP TABLE IF EXISTS writeoffs`, (err) => {
    if (err) {
      console.error('❌ Error dropping writeoffs table:', err);
    } else {
      console.log('✅ Table writeoffs dropped (if existed)');
    }
  });
  
  db.run(`DROP TABLE IF EXISTS writeoff_products`, (err) => {
    if (err) {
      console.error('❌ Error dropping writeoff_products table:', err);
    } else {
      console.log('✅ Table writeoff_products dropped (if existed)');
    }
  });

  // Миграция: замена префикса OP/RCH на RW в номерах rozchodu (odpisanie)
  db.run(`UPDATE orders SET numer_zamowienia = 'RW' || SUBSTR(numer_zamowienia, 3) WHERE typ = 'odpisanie' AND (numer_zamowienia LIKE 'OP%' OR numer_zamowienia LIKE 'RCH%')`, function(err) {
    if (err) {
      console.error('❌ Error migrating to RW:', err);
    } else if (this.changes > 0) {
      console.log(`✅ Migrated ${this.changes} records to RW prefix`);
    } else {
      console.log('✅ No records to migrate (migration already applied or no records)');
    }
  });

  // Таблица рабочих листов
  db.run(`CREATE TABLE IF NOT EXISTS working_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    ilosc INTEGER DEFAULT 0,
    kod_kreskowy TEXT,
    data_waznosci DATE,
    rezerwacje INTEGER DEFAULT 0,
    objetosc TEXT,
    typ TEXT,
    sprzedawca TEXT,
    cena REAL DEFAULT 0,
    cena_sprzedazy REAL DEFAULT 0,
    produkt_id INTEGER,
    data DATE,
    archived INTEGER DEFAULT 0,
    archived_at TIMESTAMP,
    koszt_dostawy_per_unit REAL DEFAULT 0,
    podatek_akcyzowy REAL DEFAULT 0,
    koszt_wlasny REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating working_sheets table:', err);
    } else {
      console.log('✅ Working sheets table ready');
    }
  });

  // Таблица приемок товаров
  db.run(`CREATE TABLE IF NOT EXISTS product_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataPrzyjecia DATE NOT NULL,
    sprzedawca TEXT,
    wartosc REAL DEFAULT 0,
    kosztDostawy REAL DEFAULT 0,
    aktualny_kurs REAL DEFAULT 1,
    podatek_akcyzowy REAL DEFAULT 0,
    products TEXT, -- JSON массив товаров
    productInvoice TEXT,
    transportInvoice TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating product_receipts table:', err);
    } else {
      console.log('✅ Product receipts table ready');
    }
  });

  // Таблица оригинальных листов
  db.run(`CREATE TABLE IF NOT EXISTS original_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating original_sheets table:', err);
    } else {
      console.log('✅ Original sheets table ready');
    }
  });

  // Используется только таблица products для FIFO-списаний

  // Таблица потребления заказов (FIFO tracking)
  db.run(`CREATE TABLE IF NOT EXISTS order_consumptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_kod TEXT NOT NULL,
    batch_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    batch_price REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating order_consumptions table:', err);
    } else {
      console.log('✅ Order consumptions table ready');
    }
  });

  // Таблица резерваций
  db.run(`CREATE TABLE IF NOT EXISTS  reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    numer_rezerwacji TEXT UNIQUE NOT NULL,
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_zakonczenia DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'aktywna',
    komentarz TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE RESTRICT
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating reservations table:', err);
    } else {
      console.log('✅ Reservations table ready');
    }
  });

  // Таблица товаров в резервациях
  db.run(`CREATE TABLE IF NOT EXISTS reservation_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id INTEGER NOT NULL,
    product_id INTEGER,
    product_kod TEXT NOT NULL,
    product_nazwa TEXT NOT NULL,
    kod_kreskowy TEXT,
    ilosc INTEGER NOT NULL DEFAULT 1,
    komentarz TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating reservation_products table:', err);
    } else {
      console.log('✅ Reservation products table ready');
      
      // Добавляем колонку ilosc_wydane если её нет
      db.run(`ALTER TABLE reservation_products ADD COLUMN ilosc_wydane INTEGER DEFAULT 0`, (alterErr) => {
        if (alterErr) {
          // Колонка уже существует - это нормально
          if (alterErr.message.includes('duplicate column name') || alterErr.message.includes('already exists')) {
            console.log('✅ Column ilosc_wydane already exists in reservation_products');
          } else {
            console.error('❌ Error adding ilosc_wydane column:', alterErr);
          }
        } else {
          console.log('✅ Column ilosc_wydane added to reservation_products');
        }
      });
    }
  });

  // Таблица связи резерваций и заказов (для отслеживания выданных товаров)
  db.run(`CREATE TABLE IF NOT EXISTS reservation_order_fulfillments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_product_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    order_product_id INTEGER,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_product_id) REFERENCES reservation_products (id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (order_product_id) REFERENCES order_products (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating reservation_order_fulfillments table:', err);
    } else {
      console.log('✅ Reservation order fulfillments table ready');
    }
  });

  // Индексы для таблицы reservations
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservations_client_id ON reservations(client_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservations_client_id:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservations_status:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservations_data_zakonczenia ON reservations(data_zakonczenia)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservations_data_zakonczenia:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservations_numer_rezerwacji ON reservations(numer_rezerwacji)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservations_numer_rezerwacji:', err);
  });

  // Индексы для таблицы reservation_products
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservation_products_reservation_id ON reservation_products(reservation_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservation_products_reservation_id:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservation_products_product_id ON reservation_products(product_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservation_products_product_id:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_reservation_products_product_kod ON reservation_products(product_kod)`, (err) => {
    if (err) console.error('❌ Error creating index idx_reservation_products_product_kod:', err);
  });

  // Индексы для таблицы reservation_order_fulfillments
  db.run(`CREATE INDEX IF NOT EXISTS idx_fulfillments_reservation_product_id ON reservation_order_fulfillments(reservation_product_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_fulfillments_reservation_product_id:', err);
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_fulfillments_order_id ON reservation_order_fulfillments(order_id)`, (err) => {
    if (err) console.error('❌ Error creating index idx_fulfillments_order_id:', err);
  });

  console.log('🎉 All database tables initialized successfully');
  
  // Миграция: добавляем недостающие поля в таблицу products
  db.all("PRAGMA table_info(products)", (err, columns) => {
    if (err) {
      console.error('❌ Error checking products table structure:', err);
      return;
    }
    
    const columnNames = columns.map(col => col.name);
    console.log('📋 Current products columns:', columnNames);
  });
});

// ===== RESERVATIONS ROUTES =====
// ВАЖНО: Регистрируем маршруты резерваций в начале, чтобы они точно обрабатывались

// Endpoint для создания резерваций (регистрируем ПЕРВЫМ!)
console.log('🔧 Registering POST /api/reservations endpoint (PRIORITY)');
app.post('/api/reservations', (req, res) => {
  console.log('✅ POST /api/reservations - ROUTE MATCHED AND EXECUTING');
  console.log('📥 Incoming request:', req.method, req.url);
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  const { client_id, numer_rezerwacji: providedNumber, data_utworzenia, data_zakonczenia, komentarz, products } = req.body;
  console.log('📋 POST /api/reservations - Creating new reservation:', { client_id, numer_rezerwacji: providedNumber, data_utworzenia, data_zakonczenia, productsCount: products?.length || 0 });
  
  if (!client_id || !data_zakonczenia) {
    console.log('❌ Validation failed: client_id and data_zakonczenia are required');
    return res.status(400).json({ error: 'Client ID and end date are required' });
  }
  
  // Используем переданную дату создания или текущую дату
  const reservationDate = data_utworzenia || new Date().toISOString().split('T')[0];
  
  if (!products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: products array is required and must not be empty');
    return res.status(400).json({ error: 'Products array is required and must not be empty' });
  }

  // Используем переданный номер или генерируем новый
  let numer_rezerwacji = providedNumber;
  
  // Проверяем доступность товаров перед созданием резервации
  console.log('🔍 Checking product availability for reservation...');
  
  // Создаем массив для проверки доступности
  const availabilityChecks = products.map(product => {
    return new Promise((resolve, reject) => {
      const { product_kod, product_nazwa, ilosc } = product;
      
      // Проверяем доступное количество с учетом активных резерваций
      // Подзапросы: total_available суммирует ВСЕ строки по kod (основные + семплы)
      db.get(`
        SELECT 
          (SELECT COALESCE(SUM(ilosc), 0) FROM working_sheets WHERE kod = ?) as total_available,
          COALESCE((
            SELECT SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0))
            FROM reservation_products rp
            INNER JOIN reservations r ON rp.reservation_id = r.id
            WHERE rp.product_kod = ? AND r.status = 'aktywna'
          ), 0) as reserved
      `, [product_kod, product_kod], (err, row) => {
        if (err) {
          reject({ kod: product_kod, error: err.message });
        } else if (!row) {
          reject({ kod: product_kod, nazwa: product_nazwa, ilosc, available: 0, error: 'Product not found in working_sheets' });
        } else {
          const available = row.total_available - row.reserved;
          if (available < ilosc) {
            reject({ kod: product_kod, nazwa: product_nazwa, ilosc, available: available, reserved: row.reserved, total: row.total_available, error: 'Insufficient quantity' });
          } else {
            resolve({ kod: product_kod, nazwa: product_nazwa, ilosc, available: available });
          }
        }
      });
    });
  });
  
  // Выполняем все проверки
  Promise.all(availabilityChecks)
    .then((results) => {
      console.log('✅ All products are available for reservation');
      
      // Если все проверки прошли, создаем резервацию
      const createReservation = (finalNumber, retryCount = 0) => {
        // Защита от бесконечной рекурсии
        if (retryCount > 5) {
          console.error(`❌ Too many retries (${retryCount}) for reservation number generation`);
          return res.status(500).json({ 
            error: 'Failed to generate unique reservation number after multiple attempts',
            details: { attemptedNumber: finalNumber, retries: retryCount }
          });
        }

        // Создаем резервацию
        db.run(
          'INSERT INTO reservations (client_id, numer_rezerwacji, data_utworzenia, data_zakonczenia, status, komentarz) VALUES (?, ?, ?, ?, ?, ?)',
          [client_id, finalNumber, reservationDate, data_zakonczenia, 'aktywna', komentarz || null],
          function(err) {
            if (err) {
              // Если ошибка уникальности, пытаемся сгенерировать новый номер
              if (err.message.includes('UNIQUE constraint') || err.message.includes('unique')) {
                console.log(`⚠️ Reservation number ${finalNumber} already exists (attempt ${retryCount + 1}), generating new one...`);
                getNextReservationNumber(reservationDate, (retryErr, newNumber, maxNumber) => {
                  if (retryErr) {
                    console.error('❌ Error finding max reservation number on retry:', retryErr);
                    return res.status(500).json({ error: retryErr.message });
                  }
                  console.log(`✅ Retry ${retryCount + 1}: Generated new reservation number: ${newNumber} (max number: ${maxNumber})`);
                  createReservation(newNumber, retryCount + 1);
                });
                return;
              }
              
              console.error('❌ Database error creating reservation:', err);
              return res.status(500).json({ error: err.message });
            }
        
        const reservationId = this.lastID;
        console.log(`✅ Reservation created with ID: ${reservationId}, number: ${finalNumber}`);
        
        // Создаем записи для каждого продукта
        let productsCreated = 0;
        let productsFailed = 0;
        
        products.forEach((product, index) => {
          const { product_kod, product_nazwa, kod_kreskowy, ilosc } = product;
          
          // Получаем product_id из таблицы products по коду
          db.get('SELECT id FROM products WHERE kod = ? LIMIT 1', [product_kod], (err, productRow) => {
            if (err) {
              console.error(`❌ Error finding product ${product_kod}:`, err);
              productsFailed++;
              checkCompletion();
              return;
            }

            const productId = productRow ? productRow.id : null;
            
            // Создаем запись в reservation_products
            db.run(
              'INSERT INTO reservation_products (reservation_id, product_id, product_kod, product_nazwa, kod_kreskowy, ilosc) VALUES (?, ?, ?, ?, ?, ?)',
              [reservationId, productId, product_kod, product_nazwa, kod_kreskowy || null, ilosc],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating reservation product ${index + 1}:`, err);
                  productsFailed++;
                  checkCompletion();
                } else {
                  productsCreated++;
                  console.log(`✅ Product ${index + 1} created for reservation ${reservationId} with ID: ${this.lastID}`);
                  checkCompletion();
                }
              }
            );
          });
        });
        
        function checkCompletion() {
          if (productsCreated + productsFailed === products.length) {
            if (res.headersSent) {
              console.log('⚠️ Response already sent, skipping checkCompletion');
              return;
            }
            
            if (productsFailed === 0) {
              console.log(`✅ All ${productsCreated} products created successfully for reservation ${reservationId}`);
              res.json({ 
                id: reservationId,
                numer_rezerwacji: finalNumber,
                message: 'Reservation and all products added successfully',
                productsCreated: productsCreated,
                success: true
              });
            } else {
              console.log(`⚠️ Reservation created but ${productsFailed} products failed to create`);
              res.status(500).json({ 
                id: reservationId,
                numer_rezerwacji: finalNumber,
                error: `Reservation created but ${productsFailed} products failed to create`,
                productsCreated: productsCreated,
                productsFailed: productsFailed
              });
            }
          }
        }
      }
    );
  };
  
      if (!numer_rezerwacji) {
        // Генерируем номер резервации: R001_день_месяц_год (глобальная нумерация)
        console.log(`🔢 Generating reservation number for date: ${reservationDate}`);
        getNextReservationNumber(reservationDate, (err, nextNumberString, maxNumber) => {
          if (err) {
            console.error('❌ Error finding max reservation number:', err);
            return res.status(500).json({ error: err.message });
          }
          numer_rezerwacji = nextNumberString;
          console.log(`✅ Generated reservation number: ${numer_rezerwacji} (max number was: ${maxNumber}, next: ${maxNumber + 1})`);
          createReservation(numer_rezerwacji);
        });
      } else {
        // Проверяем уникальность переданного номера
        db.get('SELECT id FROM reservations WHERE numer_rezerwacji = ?', [numer_rezerwacji], (err, existing) => {
          if (err) {
            console.error('❌ Error checking reservation number uniqueness:', err);
            return res.status(500).json({ error: err.message });
          }
          
          if (existing) {
            console.log(`❌ Reservation number ${numer_rezerwacji} already exists`);
            return res.status(400).json({ error: `Reservation number ${numer_rezerwacji} already exists` });
          }
          
        createReservation(numer_rezerwacji);
        });
      }
    })
    .catch((error) => {
      // Обрабатываем ошибки доступности
      // Promise.all отклоняется с первой ошибкой
      console.log('❌ Availability check failed for reservation');
      
      if (error.error === 'Insufficient quantity') {
        const { kod, nazwa, ilosc, available, reserved, total } = error;
        console.log(`❌ Product ${kod} (${nazwa}) - requested: ${ilosc}, available: ${available}, reserved: ${reserved}, total: ${total}`);
        res.status(400).json({ 
          error: 'Insufficient quantity',
          details: {
            kod,
            nazwa,
            requested: ilosc,
            available: available,
            reserved: reserved,
            total: total,
            message: `Niewystarczająca ilość produktu "${nazwa}" (kod: ${kod}). Zapytano: ${ilosc}, dostępne: ${available} (łącznie: ${total}, zarezerwowane: ${reserved})`
          }
        });
      } else if (error.error === 'Product not found in working_sheets') {
        const { kod, nazwa } = error;
        console.log(`❌ Product ${kod} (${nazwa}) not found in working_sheets`);
        res.status(400).json({ 
          error: 'Product not found',
          details: {
            kod,
            nazwa,
            message: `Produkt "${nazwa}" (kod: ${kod}) nie został znaleziony w systemie`
          }
        });
      } else {
        console.log(`❌ Database error checking availability:`, error);
        res.status(500).json({ 
          error: 'Database error during availability check',
          details: {
            kod: error.kod || 'unknown',
            message: `Błąd bazy danych podczas sprawdzania dostępności produktu ${error.kod || 'unknown'}`
          }
        });
      }
    });
});

// ===== RESERVATIONS ROUTES =====
// Endpoint для получения только числовой части следующего номера резервации (без даты)
// ВАЖНО: Регистрируем ПЕРВЫМ среди маршрутов резерваций, чтобы не перехватывался другими
console.log('🔧 Registering GET /api/reservations/next-number-only endpoint (PRIORITY)');
app.get('/api/reservations/next-number-only', (req, res) => {
  console.log('🔢 GET /api/reservations/next-number-only - Generating next reservation number (without date)');
  
  // Получаем все номера резерваций для поиска максимального номера
  db.all('SELECT numer_rezerwacji FROM reservations WHERE numer_rezerwacji LIKE ?', ['R%'], (err, allRows) => {
    if (err) {
      console.error('❌ Error finding max reservation number:', err);
      return res.status(500).json({ error: err.message });
    }
    
    console.log(`📋 Found ${allRows.length} reservations with R% pattern`);
    if (allRows.length > 0) {
      console.log('📋 Reservation numbers:', allRows.map(r => r.numer_rezerwacji).join(', '));
    }
    
    // Извлекаем числовую часть из каждого номера и находим максимум
    let maxNumber = 0;
    const numbers = [];
    allRows.forEach(row => {
      const match = row.numer_rezerwacji.match(/^R(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        numbers.push(num);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });
    
    console.log(`📊 Extracted numbers: [${numbers.sort((a,b) => a-b).join(', ')}], max: ${maxNumber}`);
    
    const nextNumber = maxNumber + 1;
    const numer_rezerwacji_only = `R${nextNumber.toString().padStart(3, '0')}`;
    console.log(`✅ Generated next reservation number (without date): ${numer_rezerwacji_only} (max number was: ${maxNumber}, next: ${nextNumber})`);
    res.json({ numer_rezerwacji: numer_rezerwacji_only });
  });
});

// Получение всех товаров из резерваций (активных и реализованных - для истории)
// Группирует товары по product_kod и суммирует количество
app.get('/api/reservations/active-products', (req, res) => {
  console.log('📋 GET /api/reservations/active-products - Fetching reservation products history (grouped by product)');

  // Сначала получаем сгруппированные данные по товарам
  db.all(`
    SELECT 
      rp.product_kod,
      MAX(rp.product_nazwa) as product_nazwa,
      SUM(COALESCE(rp.ilosc, 0)) as ilosc,
      SUM(COALESCE(rp.ilosc_wydane, 0)) as ilosc_wydane
    FROM reservations r
    INNER JOIN reservation_products rp ON rp.reservation_id = r.id
    WHERE LOWER(TRIM(r.status)) IN ('aktywna', 'aktywny', 'zrealizowana')
    GROUP BY rp.product_kod
    ORDER BY rp.product_nazwa ASC
  `, (err, groupedRows) => {
    if (err) {
      console.error('❌ Database error fetching reservation products:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    // Для каждого уникального товара собираем информацию о клиентах и заказах
    const processedRows = groupedRows.map(groupedRow => {
      return new Promise((resolve) => {
        if (!groupedRow.product_kod) {
          resolve({ ...groupedRow, klienci: [], zamowienia_z_iloscia: [] });
          return;
        }

        // Получаем список клиентов для этого товара (из активных и реализованных резерваций)
        db.all(`
          SELECT DISTINCT
            c.nazwa as klient,
            rp.ilosc as ilosc_per_client
          FROM reservations r
          INNER JOIN reservation_products rp ON rp.reservation_id = r.id
          LEFT JOIN clients c ON r.client_id = c.id
          WHERE LOWER(TRIM(r.status)) IN ('aktywna', 'aktywny', 'zrealizowana')
            AND rp.product_kod = ?
          ORDER BY c.nazwa ASC
        `, [groupedRow.product_kod], (err, clientRows) => {
          if (err) {
            console.error(`❌ Error fetching clients for product ${groupedRow.product_kod}:`, err);
            resolve({ ...groupedRow, klienci: [], zamowienia_z_iloscia: [] });
            return;
          }

          // Получаем все заказы для этого товара из всех резерваций (активных и реализованных)
          db.all(`
            SELECT 
              o.numer_zamowienia,
              SUM(rof.quantity) as ilosc_wydane_w_zamowieniu
            FROM reservation_order_fulfillments rof
            INNER JOIN orders o ON rof.order_id = o.id
            INNER JOIN reservation_products rp ON rof.reservation_product_id = rp.id
            INNER JOIN reservations r ON rp.reservation_id = r.id
            WHERE LOWER(TRIM(r.status)) IN ('aktywna', 'aktywny', 'zrealizowana')
              AND rp.product_kod = ?
            GROUP BY o.numer_zamowienia
            ORDER BY o.data_utworzenia DESC
          `, [groupedRow.product_kod], (err, orderRows) => {
            if (err) {
              console.error(`❌ Error fetching orders for product ${groupedRow.product_kod}:`, err);
              resolve({ 
                ...groupedRow, 
                klienci: clientRows.map(cr => ({ klient: cr.klient, ilosc: cr.ilosc_per_client })),
                zamowienia_z_iloscia: [] 
              });
              return;
            }

            resolve({
              product_kod: groupedRow.product_kod,
              product_nazwa: groupedRow.product_nazwa,
              ilosc: groupedRow.ilosc || 0,
              ilosc_wydane: groupedRow.ilosc_wydane || 0,
              klienci: clientRows.map(cr => ({ klient: cr.klient, ilosc: cr.ilosc_per_client })),
              zamowienia_z_iloscia: orderRows.map(or => ({
                numer_zamowienia: or.numer_zamowienia,
                ilosc: or.ilosc_wydane_w_zamowieniu || 0
              }))
            });
          });
        });
      });
    });

    Promise.all(processedRows).then(results => {
      console.log(`✅ Found ${results.length} unique products in reservations (history)`);
      res.json(results);
    });
  });
});

// API Routes
app.get('/api/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({ 
    status: 'OK', 
    message: 'EnoTerra ERP Server is running',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint для проверки путей
app.get('/api/test-paths', (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  let dirContents = [];
  let exists = false;

  try {
    exists = fs.existsSync(uploadsDir);
    if (exists) {
      dirContents = fs.readdirSync(uploadsDir);
    }
  } catch (error) {
    console.error('Error checking uploads directory:', error);
  }

  res.json({
    cwd: process.cwd(),
    __dirname: __dirname,
    uploadsDir: uploadsDir,
    dirContents: dirContents,
    exists: exists,
    error: exists ? null : 'Directory not found'
  });
});

// API для получения списка файлов
app.get('/api/original-sheets', (req, res) => {
  console.log('📄 GET /api/original-sheets - Fetching original sheets');
  db.all('SELECT * FROM original_sheets', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Преобразуем данные в нужный формат
    const sheets = rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      data: JSON.parse(row.data),
      created_at: row.created_at
    }));
    
    console.log(`✅ Found ${sheets.length} original sheets`);
    res.json(sheets);
  });
});

// API для проверки существования файла
app.get('/api/check_file/:fileName', (req, res) => {
  const { fileName } = req.params;
  console.log(`🔍 GET /api/check_file/${fileName} - Checking file existence`);
  
  db.get('SELECT COUNT(*) as count FROM original_sheets WHERE file_name = ?', [fileName], (err, row) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    const exists = row.count > 0;
    console.log(`✅ File ${fileName} exists: ${exists}`);
    res.json({ exists });
  });
});

// Products API
app.get('/api/products', (req, res) => {
  console.log('📦 GET /api/products - Fetching all products');
  db.all('SELECT * FROM products ORDER BY nazwa', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`✅ Found ${rows.length} products`);
    res.json(rows || []);
  });
});

app.post('/api/products', (req, res) => {
  const { kod, nazwa, kod_kreskowy, cena, cena_sprzedazy, ilosc, data_waznosci } = req.body;
  console.log('📦 POST /api/products - Creating new product:', { kod, nazwa });
  
  if (!kod || !nazwa) {
    console.log('❌ Validation failed: kod and nazwa are required');
    return res.status(400).json({ error: 'Kod and nazwa are required' });
  }
  
  db.run(
    'INSERT INTO products (kod, nazwa, kod_kreskowy, cena, cena_sprzedazy, ilosc, ilosc_aktualna, data_waznosci) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [kod, nazwa, kod_kreskowy, cena || 0, cena_sprzedazy || 0, ilosc || 0, ilosc || 0, data_waznosci],
    function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Product created with ID: ${this.lastID}`);
      res.json({ id: this.lastID, message: 'Product added successfully' });
    }
  );
});

app.get('/api/products/search', (req, res) => {
  const { query } = req.query;
  console.log(`🔍 GET /api/products/search - Searching products with query: "${query}"`);
  
  if (!query) {
    console.log('❌ Validation failed: query parameter is required');
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  db.all(
    'SELECT * FROM products WHERE nazwa LIKE ? OR kod LIKE ? ORDER BY nazwa LIMIT 10',
    [`%${query}%`, `%${query}%`],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found ${rows.length} products matching "${query}"`);
      res.json({
        products: rows || [],
        query: query,
        count: rows.length,
        timestamp: new Date().toISOString()
      });
    }
  );
});

// Получение количества samples для каждого товара
app.get('/api/products/samples-count', (req, res) => {
  console.log('📦 GET /api/products/samples-count - Fetching samples count');
  db.all(
    `SELECT kod, SUM(ilosc) as total_ilosc 
     FROM products 
     WHERE status = 'samples' 
     GROUP BY kod`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found samples count for ${rows.length} products`);
      res.json(rows || []);
    }
  );
});

// Получение количества товаров в активных резервациях (невыданное количество)
app.get('/api/products/reservations-count', (req, res) => {
  console.log('📦 GET /api/products/reservations-count - Fetching reservations count');
  db.all(
    `SELECT 
      rp.product_kod as kod,
      SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as total_ilosc
     FROM reservation_products rp
     INNER JOIN reservations r ON rp.reservation_id = r.id
     WHERE r.status = 'aktywna'
     GROUP BY rp.product_kod`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found reservations count for ${rows.length} products`);
      res.json(rows || []);
    }
  );
});

// Получение стоимости товаров (ilosc * cena для каждого kod из working_sheets)
app.get('/api/products/wartosc-towaru', (req, res) => {
  console.log('📦 GET /api/products/wartosc-towaru - Fetching product values from working_sheets');
  db.all(
    `SELECT kod, (ilosc * cena) as wartosc 
     FROM working_sheets 
     WHERE archived = 0 OR archived IS NULL`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found wartosc for ${rows.length} products from working_sheets`);
      res.json(rows || []);
    }
  );
});

// Получение самой старой даты created_at из products для каждого kod (для расчёта среднего потребления)
app.get('/api/products/oldest-date', (req, res) => {
  console.log('📦 GET /api/products/oldest-date - Fetching oldest created_at for each kod');
  db.all(
    `SELECT kod, MIN(created_at) as oldest_created_at 
     FROM products 
     GROUP BY kod`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found oldest dates for ${rows.length} products`);
      res.json(rows || []);
    }
  );
});

// Получение информации о конкретном товаре по ID
app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📦 GET /api/products/${id} - Fetching product details`);
  
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      console.log(`❌ Product with ID ${id} not found`);
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    
    console.log(`✅ Found product: ${row.nazwa} (${row.kod})`);
    res.json({
      product: row,
      selected: true,
      timestamp: new Date().toISOString()
    });
  });
});

// Функция для проверки и обновления истекших резерваций
function checkExpiredReservations() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  db.run(`
    UPDATE reservations 
    SET status = 'wygasła' 
    WHERE status = 'aktywna' 
      AND date(data_zakonczenia) < date(?)
  `, [today], function(err) {
    if (err) {
      console.error('❌ Error checking expired reservations:', err);
    } else if (this.changes > 0) {
      console.log(`✅ ${this.changes} reservation(s) marked as 'wygasła'`);
    }
  });
}

// Запускаем проверку истекших резерваций при старте сервера
setTimeout(() => {
  checkExpiredReservations();
}, 2000);

// Запускаем проверку каждый час
setInterval(() => {
  checkExpiredReservations();
}, 60 * 60 * 1000);

// Функция для проверки и обновления статуса резервации на 'zrealizowana' или обратно на 'aktywna'
function checkAndUpdateReservationStatus(reservationId) {
  // Проверяем, все ли товары в резервации полностью выданы
  db.get(`
    SELECT 
      COUNT(*) as total_products,
      SUM(CASE WHEN COALESCE(ilosc_wydane, 0) >= ilosc THEN 1 ELSE 0 END) as completed_products
    FROM reservation_products 
    WHERE reservation_id = ?
  `, [reservationId], (err, row) => {
    if (err) {
      console.error(`❌ Error checking reservation ${reservationId} status:`, err);
      return;
    }
    
    if (row && row.total_products > 0 && row.total_products === row.completed_products) {
      // Все товары выданы - меняем статус на 'zrealizowana'
      db.run(
        'UPDATE reservations SET status = ? WHERE id = ? AND status = ?',
        ['zrealizowana', reservationId, 'aktywna'],
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error updating reservation ${reservationId} status:`, updateErr);
          } else if (this.changes > 0) {
            console.log(`✅ Reservation ${reservationId} status changed to 'zrealizowana'`);
          }
        }
      );
    } else if (row && row.total_products > 0 && row.completed_products < row.total_products) {
      // Не все товары выданы - если статус 'zrealizowana', возвращаем на 'aktywna'
      db.run(
        'UPDATE reservations SET status = ? WHERE id = ? AND status = ?',
        ['aktywna', reservationId, 'zrealizowana'],
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error reverting reservation ${reservationId} status:`, updateErr);
          } else if (this.changes > 0) {
            console.log(`✅ Reservation ${reservationId} status reverted to 'aktywna' (not all products fulfilled)`);
          }
        }
      );
    }
  });
}

// Вспомогательная функция для разбивки текста на строки по ширине
function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

// Функция генерации PDF заказа
async function generateOrderPDF(order, products, res) {
  try {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const fs = await import('fs');
    const path = await import('path');
    
    // Регистрируем fontkit для поддержки пользовательских шрифтов
    let fontkit;
    try {
      fontkit = require('@pdf-lib/fontkit');
    } catch (fkErr) {
      try {
        fontkit = (await import('@pdf-lib/fontkit')).default;
      } catch {
        fontkit = null;
      }
    }
    
    // Создаем новый PDF документ
    const pdfDoc = await PDFDocument.create();
    
    if (fontkit) {
      pdfDoc.registerFontkit(fontkit);
    }
    
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 размер
    
    // Получаем стандартные шрифты с поддержкой Unicode
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Встраиваем пользовательский шрифт с поддержкой Unicode
    let soraFont;
    try {
      const soraPath = path.join(__dirname, 'fonts', 'Sora-Regular.ttf');
      const soraBytes = fs.readFileSync(soraPath);
      soraFont = await pdfDoc.embedFont(soraBytes, { subset: false });
      console.log('✅ Sora font embedded');
    } catch (fontErr) {
      console.warn('⚠️ Could not embed Sora font, falling back to Helvetica:', fontErr?.message || fontErr);
      soraFont = helveticaFont;
    }
    
    const { width, height } = page.getSize();
    const margin = 50;
    let yPosition = height - margin;
    
    // Цвета для текста
    const colors = {
      white: rgb(1, 1, 1), // white
      border: rgb(0.82, 0.82, 0.82), // #d1d5db
      text: rgb(0.22, 0.22, 0.22), // #374151
      textDark: rgb(0.12, 0.12, 0.12), // #1f2937
      textLight: rgb(0.61, 0.64, 0.69), // #9ca3af
    };
    
    // Белый фон страницы (без контейнеров и теней)
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(1, 1, 1)
    });
    
    const containerMargin = 24;
    
    // Рамка вверху страницы (опущена на 1 см = ~28 пикселей)
    const headerHeight = 80;
    const headerY = height - containerMargin - headerHeight - 28;
    
    // Внешняя рамка (тонкая, той же длины что и блоки ниже)
    page.drawRectangle({
      x: containerMargin,
      y: headerY,
      width: width - 2 * containerMargin,
      height: headerHeight,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5
    });
    
    // Вертикальная линия посередине
    const middleX = width / 2;
    page.drawLine({
      start: { x: middleX, y: headerY },
      end: { x: middleX, y: headerY + headerHeight },
      thickness: 0.5,
      color: rgb(0, 0, 0)
    });
    
    // Левая половина: логотип
    try {
      const assetsDir = path.join(__dirname, 'assets');
      const logoPath = path.join(assetsDir, 'zam_pdf_logo.jpg');

      const exists = fs.existsSync(logoPath);
      console.log('🖼 logo exists:', exists, logoPath);

      if (exists) {
        const logoBytes = fs.readFileSync(logoPath);
        console.log('🖼 logo bytes read:', logoBytes.length);
        let logoImage;
        try {
          logoImage = await pdfDoc.embedJpg(logoBytes);
        } catch (embedErr) {
          console.error('❌ embedJpg failed:', embedErr);
          throw embedErr;
        }

        // Масштабируем логотип чтобы поместился в левую половину (увеличено на 20%)
        const maxLogoWidth = (width / 2 - 2 * containerMargin) * 0.8 * 1.2;
        const maxLogoHeight = headerHeight * 0.7 * 1.2;
        const scaleFactor = Math.min(maxLogoWidth / logoImage.width, maxLogoHeight / logoImage.height, 1);
        const logoDims = logoImage.scale(scaleFactor);

        console.log('✅ logo embedded dims:', logoDims.width, logoDims.height);

        // Центрируем логотип в левой половине
        const logoX = containerMargin + (middleX - containerMargin - logoDims.width) / 2;
        const logoY = headerY + (headerHeight - logoDims.height) / 2;

        // Рисуем логотип
        page.drawImage(logoImage, {
          x: logoX,
          y: logoY,
          width: logoDims.width,
          height: logoDims.height
        });
      }
    } catch (e) {
      console.warn('⚠️ Logo not embedded:', e?.message || e);
    }
    
    // Правая половина: номер заказа (жирным шрифтом)
    const orderNumber = order.numer_zamowienia || order.id || '';
    const textWidth = helveticaBold.widthOfTextAtSize(orderNumber, 14);
    const textX = middleX + (width - middleX - containerMargin - textWidth) / 2;
    const textY = headerY + headerHeight / 2 - 7;
    
    page.drawText(orderNumber, {
      x: textX,
      y: textY,
        size: 14,
        font: helveticaBold,
        color: colors.textDark
      });
    
    yPosition = headerY - 30; // Уменьшен отступ от рамки с номером заказа
    
    // Блок с информацией о клиенте
    const clientBlockHeight = 60;
    const clientBlockY = yPosition - clientBlockHeight;
    const clientBlockBg = rgb(0.98, 0.88, 0.88); // Более бледный розовый цвет
    
    // Фон блока с рамкой
          page.drawRectangle({
      x: containerMargin,
      y: clientBlockY,
      width: width - 2 * containerMargin,
      height: clientBlockHeight,
      color: clientBlockBg,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5
    });
    
    // Информация о клиенте - двухколоночная верстка
    const clientTextX = containerMargin + 15;
    const clientRightX = middleX + 10;
    let clientY = clientBlockY + clientBlockHeight - 15;
    
    // Первая строка: klient слева, firma справа (метки жирным)
    const clientName = order.client_name || order.klient || '-';
    // klient: жирным
    const klientLabelWidth = helveticaBold.widthOfTextAtSize('klient:', 9);
    page.drawText('klient:', {
      x: clientTextX,
      y: clientY,
          size: 9,
      font: helveticaBold,
      color: rgb(0, 0, 0)
        });
    page.drawText(` ${clientName}`, {
      x: clientTextX + klientLabelWidth,
      y: clientY,
          size: 9,
      font: soraFont,
      color: rgb(0, 0, 0)
        });
        
    if (order.firma) {
      // firma: жирным
      const firmaLabelWidth = helveticaBold.widthOfTextAtSize('firma:', 9);
      page.drawText('firma:', {
        x: clientRightX,
        y: clientY,
          size: 9,
        font: helveticaBold,
        color: rgb(0, 0, 0)
        });
      page.drawText(` ${order.firma}`, {
        x: clientRightX + firmaLabelWidth,
        y: clientY,
          size: 9,
        font: soraFont,
        color: rgb(0, 0, 0)
      });
    }
    
    clientY -= 22; // Увеличен межстрочный интервал с 18 до 22
    
    // Вторая строка: adres слева, czas dostawy справа (метки жирным)
    if (order.adres) {
      const adresLabelWidth = helveticaBold.widthOfTextAtSize('adres:', 9);
      page.drawText('adres:', {
        x: clientTextX,
        y: clientY,
        size: 9,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      page.drawText(` ${order.adres}`, {
        x: clientTextX + adresLabelWidth,
        y: clientY,
        size: 9,
        font: soraFont,
        color: rgb(0, 0, 0)
      });
    }
    
    if (order.czas_dostawy) {
      const czasLabelWidth = helveticaBold.widthOfTextAtSize('czas dostawy:', 9);
      page.drawText('czas dostawy:', {
        x: clientRightX,
        y: clientY,
        size: 9,
           font: helveticaBold,
           color: rgb(0, 0, 0)
         });
      page.drawText(` ${order.czas_dostawy}`, {
        x: clientRightX + czasLabelWidth,
        y: clientY,
        size: 9,
        font: soraFont,
           color: rgb(0, 0, 0)
         });
    }
    
    yPosition = clientBlockY - 58; // Увеличен отступ на 1 см (28 пикселей дополнительно)

    // Таблица товаров
    const tableX = containerMargin + 10;
    const tableYTop = yPosition;
    const colWidths = [100, 260, 140, 30]; // Kod, Nazwa, Kod kreskowy, Ilość
    const headers = ['Kod', 'Nazwa', 'Kod kreskowy', 'Ilość'];
    let cursorX = tableX;
    headers.forEach((h, idx) => {
      page.drawText(h, { x: cursorX + 2, y: tableYTop, size: 10, font: soraFont, color: colors.text });
      cursorX += colWidths[idx];
    });

    let rowY = tableYTop - 28; // Увеличен отступ после линии (0.5 см = ~14 пикселей дополнительно)
    
    // Линия под заголовками
    page.drawLine({
      start: { x: containerMargin, y: tableYTop - 4 },
      end: { x: width - containerMargin, y: tableYTop - 4 },
      thickness: 0.5,
             color: rgb(0, 0, 0)
           });

    console.log(`🧾 PDF(main) products count: ${products?.length || 0}`);
    let currentPage = page;
    (products || []).forEach((p, index) => {
      const kod = p.kod || '-';
      const name = p.nazwa || p.product_name || '-';
      const barcode = p.kod_kreskowy || '-';
      const qty = Number(p.ilosc || p.qty || 0);

      // Разбиваем название на строки если оно слишком длинное (ширина колонки Nazwa = 210)
      const nameLines = wrapText(name, soraFont, 10, colWidths[1] - 4);
      const rowHeight = nameLines.length * 12; // Высота строки товара зависит от количества строк в названии
      
      // Проверка: если строка не помещается, создаём новую страницу
      if (rowY - rowHeight < containerMargin + 60) {
        currentPage = pdfDoc.addPage([595.28, 841.89]);
        rowY = height - containerMargin - 40;
        
        // Рисуем заголовки на новой странице
        let cursorX = tableX;
        headers.forEach((h, idx) => {
          currentPage.drawText(h, { x: cursorX + 2, y: rowY, size: 10, font: soraFont, color: colors.text });
          cursorX += colWidths[idx];
        });
        
        // Линия под заголовками
        currentPage.drawLine({
          start: { x: containerMargin, y: rowY - 4 },
          end: { x: width - containerMargin, y: rowY - 4 },
          thickness: 0.5,
             color: rgb(0, 0, 0)
           });
        
        rowY -= 28;
      }
      
      // Рисуем kod (первая колонка)
      currentPage.drawText(kod, { 
        x: tableX + 2, 
        y: rowY, 
        size: 10, 
        font: soraFont, 
        color: colors.text 
      });
      
      // Рисуем название (может быть многострочным, вторая колонка)
      let nameY = rowY;
      nameLines.forEach((line, lineIdx) => {
        currentPage.drawText(line, { 
          x: tableX + colWidths[0] + 2, 
          y: nameY - (lineIdx * 12), 
              size: 10,
          font: soraFont, 
          color: colors.text 
            });
          });
      
      // Рисуем код крескowy (третья колонка)
      currentPage.drawText(barcode, { 
        x: tableX + colWidths[0] + colWidths[1] + 2, 
        y: rowY, 
        size: 10, 
        font: soraFont, 
        color: colors.text 
      });
      
      // Рисуем количество (четвёртая колонка)
      currentPage.drawText(String(qty), { 
        x: tableX + colWidths[0] + colWidths[1] + colWidths[2] + 2, 
        y: rowY, 
        size: 10, 
        font: soraFont, 
        color: colors.text 
      });
      
      rowY -= rowHeight + 6; // Переходим к следующему товару с учетом высоты + отступ
    });
    
    // Линия под всеми товарами (на последней странице) - сразу после последнего товара
    const lineY = rowY + 14; // Небольшой отступ как сверху (14 пикселей)
    currentPage.drawLine({
      start: { x: containerMargin, y: lineY },
      end: { x: width - containerMargin, y: lineY },
      thickness: 0.5,
              color: rgb(0, 0, 0)
            });
            
    // Итого - Razem под линией (на последней странице)
    yPosition = lineY - 18;
    
    // Метка Razem с двоеточием
    currentPage.drawText('Razem:', {
      x: tableX + colWidths[0] + colWidths[1] + colWidths[2] - 55,
              y: yPosition,
      size: 10,
      font: soraFont,
      color: colors.textDark
    });
    
    // Значение выровнено с колонкой Ilość, жирным шрифтом
    const razemValueX = tableX + colWidths[0] + colWidths[1] + colWidths[2] + 2; // Точное выравнивание с колонкой Ilość
    const razemValue = String(order.laczna_ilosc || 0);
    
    currentPage.drawText(razemValue, {
      x: razemValueX,
             y: yPosition,
      size: 9,
             font: helveticaBold,
      color: colors.textDark
    });

    // Убрали подписи снизу
        
        const pdfBytes = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="order_${order.numer_zamowienia}.pdf"`);
        res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error generating PDF:', error);
    
    // Если ошибка связана с кодировкой, не используем старую разметку
    if (error.message && error.message.includes('WinAnsi cannot encode')) {
      console.error('PDF unicode encoding failed (WinAnsi). Fallback disabled.');
      return res.status(500).json({ error: 'PDF unicode encoding failed' });
    }
    
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}

// Orders API
app.get('/api/orders', (req, res) => {
  console.log('📋 GET /api/orders - Fetching all orders');
  db.all('SELECT * FROM orders ORDER BY data_utworzenia DESC', (err, orderRows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${orderRows.length} orders`);
    
    if (orderRows.length === 0) {
      return res.json([]);
    }
    
    // Для каждого заказа получаем продукты
    let ordersProcessed = 0;
    const ordersWithProducts = [];
    
    orderRows.forEach((order) => {
      console.log(`🔍 Fetching products for order ${order.id} (${order.numer_zamowienia})`);
      db.all('SELECT * FROM order_products WHERE orderId = ? ORDER BY id', [order.id], (err, productRows) => {
        if (err) {
          console.error(`❌ Error fetching products for order ${order.id}:`, err);
          console.error(`❌ Error details:`, err.message);
          // Добавляем заказ без продуктов в случае ошибки
          ordersWithProducts.push({
            ...order,
            products: []
          });
        } else {
          console.log(`✅ Found ${productRows?.length || 0} products for order ${order.id}`);
          ordersWithProducts.push({
            ...order,
            products: productRows || []
          });
        }
        
        ordersProcessed++;
        
        // Когда все заказы обработаны, отправляем ответ
        if (ordersProcessed === orderRows.length) {
          console.log(`✅ All ${ordersProcessed} orders processed with products`);
          res.json(ordersWithProducts);
        }
      });
    });
  });
});

// Поиск заказов по номеру для возврата (частичный поиск)
app.get('/api/orders/search', (req, res) => {
  const { numer_zamowienia } = req.query;
  console.log(`🔍 GET /api/orders/search - Searching orders by number: ${numer_zamowienia}`);
  
  if (!numer_zamowienia) {
    console.log('❌ Validation failed: numer_zamowienia is required');
    return res.status(400).json({ error: 'Order number is required' });
  }
  
  // Поиск заказов по частичному совпадению номера
  const searchPattern = `%${numer_zamowienia}%`;
  db.all('SELECT * FROM orders WHERE numer_zamowienia LIKE ? ORDER BY data_utworzenia DESC LIMIT 10', [searchPattern], (err, orderRows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!orderRows || orderRows.length === 0) {
      console.log(`❌ No orders found matching pattern: ${searchPattern}`);
      return res.json([]);
    }
    
    console.log(`✅ Found ${orderRows.length} orders matching pattern: ${searchPattern}`);
    
    // Для каждого заказа получаем продукты
    let ordersProcessed = 0;
    const ordersWithProducts = [];
    
    orderRows.forEach((order) => {
      db.all('SELECT * FROM order_products WHERE orderId = ? ORDER BY id', [order.id], (err, productRows) => {
        if (err) {
          console.error(`❌ Error fetching products for order ${order.id}:`, err);
          ordersWithProducts.push({
            id: order.id,
            numer_zamowienia: order.numer_zamowienia,
            klient: order.klient,
            klient_id: order.id,
            klient_firma: '',
            klient_adres: '',
            klient_kontakt: '',
            data_utworzenia: order.data_utworzenia,
            products: []
          });
        } else {
          ordersWithProducts.push({
            id: order.id,
            numer_zamowienia: order.numer_zamowienia,
            klient: order.klient,
            klient_id: order.id,
            klient_firma: '',
            klient_adres: '',
            klient_kontakt: '',
            data_utworzenia: order.data_utworzenia,
            products: productRows || []
          });
        }
        
        ordersProcessed++;
        
        // Когда все заказы обработаны, отправляем ответ
        if (ordersProcessed === orderRows.length) {
          console.log(`✅ All ${ordersProcessed} orders processed with products`);
          res.json(ordersWithProducts);
        }
      });
    });
  });
});

// PDF Generation API для отчёта по остаткам
async function generateInventoryReportPDF(items, res) {
  try {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const fs = await import('fs');
    const path = await import('path');
    
    // Регистрируем fontkit для поддержки пользовательских шрифтов
    let fontkit;
    try {
      fontkit = require('@pdf-lib/fontkit');
    } catch (fkErr) {
      try {
        fontkit = (await import('@pdf-lib/fontkit')).default;
      } catch {
        fontkit = null;
      }
    }
    
    // Создаем новый PDF документ
    const pdfDoc = await PDFDocument.create();
    
    if (fontkit) {
      pdfDoc.registerFontkit(fontkit);
    }
    
    let currentPage = pdfDoc.addPage([792, 1224]); // Таблоид формат (11" × 17" = 792 × 1224 точек)
    
    // Получаем стандартные шрифты
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Встраиваем пользовательский шрифт с поддержкой Unicode
    let soraFont;
    try {
      const soraPath = path.join(__dirname, 'fonts', 'Sora-Regular.ttf');
      const soraBytes = fs.readFileSync(soraPath);
      soraFont = await pdfDoc.embedFont(soraBytes, { subset: false });
    } catch (fontErr) {
      soraFont = helveticaFont;
    }
    
    const { width, height } = currentPage.getSize();
    const margin = 50;
    let yPosition = height - margin;
    
    // Цвета
    const colors = {
      text: rgb(0.22, 0.22, 0.22),
      textDark: rgb(0.12, 0.12, 0.12),
      border: rgb(0.82, 0.82, 0.82),
    };
    
    // Цвета и метки для типов товаров (соответствуют TYPY_TOWARU из фронтенда)
    const typConfigs = {
      'czerwone': { label: 'Czerwone', bg: rgb(0.996, 0.886, 0.886), text: rgb(0.6, 0.106, 0.106), border: rgb(0.996, 0.792, 0.792) },
      'biale': { label: 'Białe', bg: rgb(0.953, 0.957, 0.969), text: rgb(0.122, 0.161, 0.216), border: rgb(0.898, 0.906, 0.922) },
      'musujace': { label: 'Musujące', bg: rgb(1.0, 0.984, 0.922), text: rgb(0.792, 0.541, 0.016), border: rgb(0.996, 0.953, 0.780) },
      'bezalkoholowe': { label: 'Bezalkoholowe', bg: rgb(0.863, 0.988, 0.906), text: rgb(0.086, 0.396, 0.204), border: rgb(0.733, 0.969, 0.816) },
      'ferment': { label: 'Ferment', bg: rgb(1.0, 0.929, 0.835), text: rgb(0.604, 0.204, 0.071), border: rgb(0.996, 0.843, 0.667) },
      'rozowe': { label: 'Różowe', bg: rgb(0.988, 0.906, 0.953), text: rgb(0.616, 0.090, 0.302), border: rgb(0.984, 0.812, 0.910) },
      'slodkie': { label: 'Słodkie', bg: rgb(0.953, 0.910, 1.0), text: rgb(0.420, 0.129, 0.659), border: rgb(0.914, 0.835, 1.0) },
      'aksesoria': { label: 'Aksesoria', bg: rgb(0.878, 0.906, 1.0), text: rgb(0.216, 0.188, 0.639), border: rgb(0.780, 0.824, 0.996) },
      'amber': { label: 'Amber', bg: rgb(0.996, 0.953, 0.780), text: rgb(0.573, 0.251, 0.055), border: rgb(0.992, 0.902, 0.541) }
    };
    
    // Функция для получения конфигурации типа
    const getTypConfig = (typ) => {
      return typConfigs[typ] || { label: typ || '-', bg: rgb(0.953, 0.957, 0.969), text: rgb(0.122, 0.161, 0.216), border: rgb(0.898, 0.906, 0.922) };
    };
    
    // Заголовок
    currentPage.drawText('Raport stanów magazynowych', {
      x: margin,
      y: yPosition,
      size: 19,
      font: soraFont,
      color: colors.textDark,
    });
    yPosition -= 40;
    
    // Дата генерации (день, месяц, год)
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}.${month}.${year}`;
    currentPage.drawText(dateStr, {
      x: margin,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.text,
    });
    yPosition -= 30;
    
    // Заголовки таблицы
    const tableStartY = yPosition;
    const colWidths = {
      nazwa: 300,
      sprzedawca: 150,
      objetosc: 60,
      typ: 100,
      ilosc: 35
    };
    const colX = {
      nazwa: margin,
      sprzedawca: margin + colWidths.nazwa,
      objetosc: margin + colWidths.nazwa + colWidths.sprzedawca,
      typ: margin + colWidths.nazwa + colWidths.sprzedawca + colWidths.objetosc,
      ilosc: margin + colWidths.nazwa + colWidths.sprzedawca + colWidths.objetosc + colWidths.typ
    };
    
    // Рисуем заголовки (soraFont для поддержки польских символов)
    currentPage.drawText('Nazwa', {
      x: colX.nazwa,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    currentPage.drawText('Sprzedawca', {
      x: colX.sprzedawca,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    currentPage.drawText('Objętość', {
      x: colX.objetosc,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    currentPage.drawText('Typ', {
      x: colX.typ,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    currentPage.drawText('Ilość', {
      x: colX.ilosc,
      y: yPosition,
      size: 9,
      font: soraFont,
      color: colors.textDark,
    });
    
    // Линия под заголовками
    yPosition -= 5;
    const tableTopY = yPosition;
    const tableLeftX = margin;
    const tableRightX = width - margin;
    
    // Верхняя линия таблицы
    currentPage.drawLine({
      start: { x: tableLeftX, y: yPosition },
      end: { x: tableRightX, y: yPosition },
      thickness: 1,
      color: colors.border,
    });
    
    // Боковые линии таблицы на первой странице (будут перерисованы до нижней линии в конце)
    currentPage.drawLine({
      start: { x: tableLeftX, y: tableTopY },
      end: { x: tableLeftX, y: tableTopY - 1000 },
      thickness: 1,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: tableRightX, y: tableTopY },
      end: { x: tableRightX, y: tableTopY - 1000 },
      thickness: 1,
      color: colors.border,
    });
    
    // Вертикальные линии между колонками
    currentPage.drawLine({
      start: { x: colX.sprzedawca, y: tableTopY },
      end: { x: colX.sprzedawca, y: tableTopY - 1000 }, // Достаточно длинная линия
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.objetosc, y: tableTopY },
      end: { x: colX.objetosc, y: tableTopY - 1000 },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.typ, y: tableTopY },
      end: { x: colX.typ, y: tableTopY - 1000 },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.ilosc, y: tableTopY },
      end: { x: colX.ilosc, y: tableTopY - 1000 },
      thickness: 0.5,
      color: colors.border,
    });
    
    yPosition -= 15;
    
    // Данные
    const rowHeight = 15;
    const minY = margin + 50;
    
    // Функция для разбиения текста на строки по ширине колонки
    const wrapText = (text, maxWidth, fontSize, font) => {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);
        
        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            // Если одно слово длиннее ширины, разбиваем его по символам
            let wordLine = '';
            for (const char of word) {
              const testCharLine = wordLine + char;
              const testCharWidth = font.widthOfTextAtSize(testCharLine, fontSize);
              if (testCharWidth <= maxWidth) {
                wordLine = testCharLine;
              } else {
                if (wordLine) lines.push(wordLine);
                wordLine = char;
              }
            }
            if (wordLine) currentLine = wordLine;
          }
        }
      }
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      return lines.length > 0 ? lines : [''];
    };
    
    // Отслеживаем границы таблицы на каждой странице
    let pageBottomY = null;
    let pageTopY = tableTopY; // Верхняя граница таблицы на текущей странице
    
    items.forEach((item, index) => {
      // Данные строки
      const nazwaText = item.nazwa || '';
      const sprzedawca = (item.sprzedawca || '').substring(0, 15);
      const ilosc = String(item.ilosc || 0);
      const typConfig = getTypConfig(item.typ);
      const typLabel = typConfig.label || '-';
      const objetosc = item.objetosc ? `${item.objetosc} l` : '-';
      
      // Разбиваем nazwa на строки по ширине колонки (с учетом отступа)
      const nazwaMaxWidth = colWidths.nazwa - 4; // -4 для отступов
      const nazwaLines = wrapText(nazwaText, nazwaMaxWidth, 8, soraFont);
      const nazwaRowHeight = Math.max(rowHeight, nazwaLines.length * 12); // Минимум 12 точек на строку
      
      // Проверяем, нужна ли новая страница с учетом высоты строки
      if (yPosition - nazwaRowHeight < minY) {
        // Перерисовываем вертикальные линии до нижней границы на текущей странице
        if (pageBottomY !== null) {
          // Используем сохраненную верхнюю границу таблицы на этой странице
          currentPage.drawLine({
            start: { x: colX.sprzedawca, y: pageTopY },
            end: { x: colX.sprzedawca, y: pageBottomY },
            thickness: 0.5,
            color: colors.border,
          });
          currentPage.drawLine({
            start: { x: colX.objetosc, y: pageTopY },
            end: { x: colX.objetosc, y: pageBottomY },
            thickness: 0.5,
            color: colors.border,
          });
          currentPage.drawLine({
            start: { x: colX.typ, y: pageTopY },
            end: { x: colX.typ, y: pageBottomY },
            thickness: 0.5,
            color: colors.border,
          });
          currentPage.drawLine({
            start: { x: colX.ilosc, y: pageTopY },
            end: { x: colX.ilosc, y: pageBottomY },
            thickness: 0.5,
            color: colors.border,
          });
          // Боковые линии
          currentPage.drawLine({
            start: { x: tableLeftX, y: pageTopY },
            end: { x: tableLeftX, y: pageBottomY },
            thickness: 1,
            color: colors.border,
          });
          currentPage.drawLine({
            start: { x: tableRightX, y: pageTopY },
            end: { x: tableRightX, y: pageBottomY },
            thickness: 1,
            color: colors.border,
          });
          // Нижняя линия таблицы на этой странице
          currentPage.drawLine({
            start: { x: tableLeftX, y: pageBottomY },
            end: { x: tableRightX, y: pageBottomY },
            thickness: 1,
            color: colors.border,
          });
        }
        
        currentPage = pdfDoc.addPage([792, 1224]); // Таблоид формат
        yPosition = height - margin;
        pageBottomY = null; // Сбрасываем для новой страницы
        
        // Повторяем заголовки на новой странице (жирным шрифтом)
        const newTableTopY = yPosition;
        pageTopY = yPosition - 5; // Сохраняем верхнюю границу таблицы на новой странице
          currentPage.drawText('Nazwa', {
            x: colX.nazwa + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
          currentPage.drawText('Sprzedawca', {
            x: colX.sprzedawca + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
          currentPage.drawText('Objętość', {
            x: colX.objetosc + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
          currentPage.drawText('Typ', {
            x: colX.typ + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
          currentPage.drawText('Ilość', {
            x: colX.ilosc + 2,
            y: yPosition,
            size: 9,
            font: soraFont,
            color: colors.textDark,
          });
        
        // Линия под заголовками (как на первой странице)
        yPosition -= 5;
        const newTableTopYForLines = yPosition;
        pageTopY = newTableTopYForLines; // Обновляем верхнюю границу таблицы
        
        // Верхняя линия таблицы на новой странице
        currentPage.drawLine({
          start: { x: tableLeftX, y: newTableTopYForLines },
          end: { x: tableRightX, y: newTableTopYForLines },
          thickness: 1,
          color: colors.border,
        });
        
        // Вертикальные линии между колонками на новой странице (будут перерисованы до нижней границы в конце)
        currentPage.drawLine({
          start: { x: colX.sprzedawca, y: newTableTopYForLines },
          end: { x: colX.sprzedawca, y: newTableTopYForLines - 1000 },
          thickness: 0.5,
          color: colors.border,
        });
        currentPage.drawLine({
          start: { x: colX.objetosc, y: newTableTopYForLines },
          end: { x: colX.objetosc, y: newTableTopYForLines - 1000 },
          thickness: 0.5,
          color: colors.border,
        });
        currentPage.drawLine({
          start: { x: colX.typ, y: newTableTopYForLines },
          end: { x: colX.typ, y: newTableTopYForLines - 1000 },
          thickness: 0.5,
          color: colors.border,
        });
        currentPage.drawLine({
          start: { x: colX.ilosc, y: newTableTopYForLines },
          end: { x: colX.ilosc, y: newTableTopYForLines - 1000 },
          thickness: 0.5,
          color: colors.border,
        });
        
        // Боковые линии таблицы на новой странице (будут перерисованы до нижней границы в конце)
        currentPage.drawLine({
          start: { x: tableLeftX, y: newTableTopYForLines },
          end: { x: tableLeftX, y: newTableTopYForLines - 1000 },
          thickness: 1,
          color: colors.border,
        });
        currentPage.drawLine({
          start: { x: tableRightX, y: newTableTopYForLines },
          end: { x: tableRightX, y: newTableTopYForLines - 1000 },
          thickness: 1,
          color: colors.border,
        });
        
        // Устанавливаем yPosition для первой строки данных (как на первой странице)
        yPosition -= 15;
      }
      
      // Рисуем горизонтальную линию между строками (верхняя граница ячейки)
      const lineY = yPosition;
      currentPage.drawLine({
        start: { x: tableLeftX, y: lineY },
        end: { x: tableRightX, y: lineY },
        thickness: 0.5,
        color: colors.border,
      });
      
      // Рисуем nazwa на нескольких строках, если нужно
      // Вычисляем начальную позицию текста так, чтобы весь блок текста был центрирован в ячейке
      // Высота всего блока текста = nazwaLines.length * 12
      const totalTextHeight = nazwaLines.length * 12;
      const textStartY = yPosition - (nazwaRowHeight - totalTextHeight) / 2 - 8; // -8 для базовой линии текста
      
      nazwaLines.forEach((line, lineIndex) => {
        currentPage.drawText(line, {
          x: colX.nazwa + 2,
          y: textStartY - (lineIndex * 12),
          size: 8,
          font: soraFont,
          color: colors.text,
        });
      });
      
      // Вычисляем вертикальный центр для других колонок (если nazwa занимает несколько строк)
      // Центр должен быть в середине ячейки, которая имеет высоту nazwaRowHeight
      const centerY = yPosition - nazwaRowHeight / 2;
      
      // Рисуем текст typ без цветного фона
      if (item.typ) {
        // Центрируем текст по горизонтали и вертикали в ячейке
        const fontSize = 8;
        const typTextWidth = soraFont.widthOfTextAtSize(typLabel, fontSize);
        const typCellWidth = colX.ilosc - colX.typ;
        const typTextX = colX.typ + (typCellWidth - typTextWidth) / 2;
        
        currentPage.drawText(typLabel, {
          x: typTextX,
          y: centerY,
          size: fontSize,
          font: soraFont,
          color: colors.text,
        });
      } else {
        // Если нет типа, просто рисуем "-"
        currentPage.drawText('-', {
          x: colX.typ + 2,
          y: centerY,
          size: 8,
          font: soraFont,
          color: colors.text,
        });
      }
      
      currentPage.drawText(sprzedawca, {
        x: colX.sprzedawca + 2,
        y: centerY,
        size: 8,
        font: soraFont,
        color: colors.text,
      });
      
      // Центрируем objetosc по горизонтали и вертикали
      const objetoscTextWidth = soraFont.widthOfTextAtSize(objetosc, 8);
      const objetoscTextX = colX.objetosc + (colWidths.objetosc - objetoscTextWidth) / 2;
      
      currentPage.drawText(objetosc, {
        x: objetoscTextX,
        y: centerY,
        size: 8,
        font: soraFont,
        color: colors.text,
      });
      
      // Центрируем ilosc по горизонтали и вертикали
      const iloscTextWidth = soraFont.widthOfTextAtSize(ilosc, 8);
      const iloscTextX = colX.ilosc + (colWidths.ilosc - iloscTextWidth) / 2;
      
      currentPage.drawText(ilosc, {
        x: iloscTextX,
        y: centerY,
        size: 8,
        font: soraFont,
        color: colors.text,
      });
      
      yPosition -= nazwaRowHeight;
      // Обновляем нижнюю границу таблицы на текущей странице
      pageBottomY = yPosition;
    });
    
    // Итого - нижняя линия таблицы
    yPosition -= 10;
    const tableBottomY = yPosition;
    // Обновляем нижнюю границу для последней страницы
    pageBottomY = tableBottomY;
    currentPage.drawLine({
      start: { x: tableLeftX, y: yPosition },
      end: { x: tableRightX, y: yPosition },
      thickness: 1,
      color: colors.border,
    });
    
    // Перерисовываем вертикальные линии между колонками до нижней линии таблицы на последней странице
    // Используем сохраненную верхнюю границу таблицы на этой странице
    const finalPageTopY = pageTopY || tableTopY;
    currentPage.drawLine({
      start: { x: colX.sprzedawca, y: finalPageTopY },
      end: { x: colX.sprzedawca, y: tableBottomY },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.objetosc, y: finalPageTopY },
      end: { x: colX.objetosc, y: tableBottomY },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.typ, y: finalPageTopY },
      end: { x: colX.typ, y: tableBottomY },
      thickness: 0.5,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: colX.ilosc, y: finalPageTopY },
      end: { x: colX.ilosc, y: tableBottomY },
      thickness: 0.5,
      color: colors.border,
    });
    
    // Боковые линии таблицы (левая и правая) - перерисовываем до нижней линии
    currentPage.drawLine({
      start: { x: tableLeftX, y: finalPageTopY },
      end: { x: tableLeftX, y: tableBottomY },
      thickness: 1,
      color: colors.border,
    });
    currentPage.drawLine({
      start: { x: tableRightX, y: finalPageTopY },
      end: { x: tableRightX, y: tableBottomY },
      thickness: 1,
      color: colors.border,
    });
    
    // Скрываем продолжение вертикальных линий после последней горизонтальной линии
    // Рисуем белые линии поверх старых длинных линий
    const white = rgb(1, 1, 1);
    const hideLineLength = 100; // Достаточно длинная линия, чтобы скрыть продолжение
    currentPage.drawLine({
      start: { x: colX.sprzedawca, y: tableBottomY },
      end: { x: colX.sprzedawca, y: tableBottomY - hideLineLength },
      thickness: 0.5,
      color: white,
    });
    currentPage.drawLine({
      start: { x: colX.objetosc, y: tableBottomY },
      end: { x: colX.objetosc, y: tableBottomY - hideLineLength },
      thickness: 0.5,
      color: white,
    });
    currentPage.drawLine({
      start: { x: colX.typ, y: tableBottomY },
      end: { x: colX.typ, y: tableBottomY - hideLineLength },
      thickness: 0.5,
      color: white,
    });
    currentPage.drawLine({
      start: { x: colX.ilosc, y: tableBottomY },
      end: { x: colX.ilosc, y: tableBottomY - hideLineLength },
      thickness: 0.5,
      color: white,
    });
    currentPage.drawLine({
      start: { x: tableLeftX, y: tableBottomY },
      end: { x: tableLeftX, y: tableBottomY - hideLineLength },
      thickness: 1,
      color: white,
    });
    currentPage.drawLine({
      start: { x: tableRightX, y: tableBottomY },
      end: { x: tableRightX, y: tableBottomY - hideLineLength },
      thickness: 1,
      color: white,
    });
    
    
    const pdfBytes = await pdfDoc.save();
    const filenameDay = String(now.getDate()).padStart(2, '0');
    const filenameMonth = String(now.getMonth() + 1).padStart(2, '0');
    const filenameDate = `${filenameDay}-${filenameMonth}`; // DD-MM
    const filename = `stany_${filenameDate}.pdf`;
    
    if (res.headersSent) {
      console.error('Response already sent, cannot send PDF');
      return;
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error generating inventory report PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  }
}

const inventoryReportOrderClause = `
       ORDER BY sprzedawca, 
         CASE typ
           WHEN 'czerwone' THEN 1
           WHEN 'biale' THEN 2
           WHEN 'musujace' THEN 3
           WHEN 'rozowe' THEN 4
           WHEN 'ferment' THEN 5
           WHEN 'bezalkoholowe' THEN 6
           WHEN 'slodkie' THEN 7
           WHEN 'amber' THEN 8
           ELSE 9
         END,
         ilosc DESC,
         nazwa`;

app.get('/api/inventory/report/pdf', async (req, res) => {
  console.log('📊 GET /api/inventory/report/pdf - Generating inventory report');
  
  try {
    // Получаем данные из working_sheets с фильтрами: ilosc > 0 и typ != 'aksesoria'
    db.all(
      `SELECT nazwa, sprzedawca, ilosc, typ, objetosc 
       FROM working_sheets 
       WHERE (archived = 0 OR archived IS NULL) 
         AND ilosc > 0 
         AND (typ IS NULL OR typ != 'aksesoria')
       ${inventoryReportOrderClause}`,
      [],
      async (err, rows) => {
        if (err) {
          console.error('❌ Database error:', err);
          return res.status(500).json({ error: err.message });
        }
        
        console.log(`✅ Found ${rows.length} items for report`);
        try {
          await generateInventoryReportPDF(rows || [], res);
        } catch (pdfError) {
          console.error('❌ Error generating PDF:', pdfError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
          }
        }
      }
    );
  } catch (error) {
    console.error('Error in inventory report generation:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Raport tylko dla zaznaczonych na stronie stanów (te same kolumny i filtry co GET)
app.post('/api/inventory/report/pdf', async (req, res) => {
  console.log('📊 POST /api/inventory/report/pdf - Generating inventory report (selected ids)');
  try {
    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ error: 'ids (non-empty array) is required' });
    }
    const ids = [...new Set(
      rawIds
        .map((id) => parseInt(String(id), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
    )];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid numeric ids' });
    }
    if (ids.length > 5000) {
      return res.status(400).json({ error: 'Too many ids' });
    }
    const placeholders = ids.map(() => '?').join(',');
    db.all(
      `SELECT nazwa, sprzedawca, ilosc, typ, objetosc 
       FROM working_sheets 
       WHERE (archived = 0 OR archived IS NULL) 
         AND ilosc > 0 
         AND (typ IS NULL OR typ != 'aksesoria')
         AND id IN (${placeholders})
       ${inventoryReportOrderClause}`,
      ids,
      async (err, rows) => {
        if (err) {
          console.error('❌ Database error:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Found ${rows.length} items for selected report`);
        if (!rows || rows.length === 0) {
          return res.status(404).json({
            error:
              'Żadna z zaznaczonych pozycji nie spełnia warunków raportu (ilość > 0, typ inny niż aksesoria, niezarchiwizowane).',
          });
        }
        try {
          await generateInventoryReportPDF(rows || [], res);
        } catch (pdfError) {
          console.error('❌ Error generating PDF:', pdfError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
          }
        }
      }
    );
  } catch (error) {
    console.error('Error in inventory report generation (POST):', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// PDF Generation API
app.get('/api/orders/:id/pdf', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Получаем данные заказа с продуктами
    const orderQuery = `
      SELECT o.*, c.firma, c.nazwa as client_name, c.adres, c.kontakt, c.czas_dostawy
      FROM orders o
      LEFT JOIN clients c ON o.klient = c.nazwa
      WHERE o.id = ?
    `;
    
    const orderProductsQuery = `
      SELECT op.*, ws.kod_kreskowy
      FROM order_products op
      LEFT JOIN working_sheets ws ON op.kod = ws.kod
      WHERE op.orderId = ?
    `;
    
    db.get(orderQuery, [id], (err, order) => {
      if (err) {
        console.error('Error fetching order:', err);
        return res.status(500).json({ error: 'Failed to fetch order' });
      }
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      db.all(orderProductsQuery, [id], (err, products) => {
        if (err) {
          console.error('Error fetching order products:', err);
          return res.status(500).json({ error: 'Failed to fetch order products' });
        }
        
        // Генерируем PDF
        generateOrderPDF(order, products, res);
      });
    });
  } catch (error) {
    console.error('Error in PDF generation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📋 GET /api/orders/${id} - Fetching order by ID`);
  
  // Получаем основную информацию о заказе
  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, orderRow) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!orderRow) {
      console.log(`❌ Order with ID ${id} not found`);
      return res.status(404).json({ error: 'Order not found' });
    }
    
    console.log(`✅ Found order: ${orderRow.numer_zamowienia}`);
    
    // Теперь получаем продукты для этого заказа
    db.all('SELECT * FROM order_products WHERE orderId = ? ORDER BY id', [id], (err, productRows) => {
      if (err) {
        console.error('❌ Database error fetching products:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      console.log(`✅ Found ${productRows.length} products for order ${id}`);
      
      // Возвращаем заказ с продуктами
      const orderWithProducts = {
        ...orderRow,
        products: productRows || []
      };
      
      res.json(orderWithProducts);
    });
  });
});

app.post('/api/orders', (req, res) => {
  const { clientName, order_number, products } = req.body;
  console.log('📋 POST /api/orders - Creating new order:', { clientName, order_number, productsCount: products?.length || 0 });
  
  if (!clientName || !order_number) {
    console.log('❌ Validation failed: clientName and order_number are required');
    return res.status(400).json({ error: 'Client name and order number are required' });
  }
  
  if (!products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: products array is required and must not be empty');
    return res.status(400).json({ error: 'Products array is required and must not be empty' });
  }
  
  // Вычисляем общее количество всех продуктов
  const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);
  
  // Получаем client_id по имени клиента
  db.get('SELECT id FROM clients WHERE nazwa = ? LIMIT 1', [clientName], (err, clientRow) => {
    if (err) {
      console.error('❌ Database error finding client:', err);
      return res.status(500).json({ error: err.message });
    }
    
    const clientId = clientRow ? clientRow.id : null;
    console.log(`🔍 Client ID for "${clientName}": ${clientId || 'not found'}`);
  
  // Проверяем доступность товаров перед созданием заказа
  console.log('🔍 Checking product availability...');
  
  // Группируем товары по коду и суммируем количество для корректной проверки
  // Это предотвращает проблему, когда один товар добавлен несколько раз в заказ
  const productGroups = new Map();
  products.forEach(product => {
    const { kod, nazwa, ilosc } = product;
    if (productGroups.has(kod)) {
      const existing = productGroups.get(kod);
      existing.totalIlosc += ilosc;
      existing.items.push(product);
    } else {
      productGroups.set(kod, {
        kod,
        nazwa,
        totalIlosc: ilosc,
        items: [product]
      });
    }
  });
  
  console.log(`📊 Grouped products: ${productGroups.size} unique products from ${products.length} order items`);
  productGroups.forEach((group, kod) => {
    console.log(`  - ${kod}: ${group.totalIlosc} szt. (${group.items.length} order item(s))`);
  });
  
  // Создаем массив для проверки доступности сгруппированных товаров
  const availabilityChecks = Array.from(productGroups.values()).map(group => {
    return new Promise((resolve, reject) => {
      const { kod, nazwa, totalIlosc } = group;
      
        // Проверяем доступное количество с учетом активных резерваций (используя ilosc - ilosc_wydane)
        db.get(`
          SELECT 
            ws.ilosc as total_available,
            COALESCE(SUM(CASE 
              WHEN r.status = 'aktywna' 
              THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0)
              ELSE 0 
            END), 0) as reserved
          FROM working_sheets ws
          LEFT JOIN reservation_products rp ON ws.kod = rp.product_kod
          LEFT JOIN reservations r ON rp.reservation_id = r.id
          WHERE ws.kod = ?
          GROUP BY ws.kod, ws.ilosc
        `, [kod], (err, row) => {
        if (err) {
          reject({ kod, error: err.message });
            return;
          }
          
          if (!row) {
          reject({ kod, nazwa, ilosc: totalIlosc, available: 0, error: 'Product not found in working_sheets' });
            return;
          }
          
          const availableOnWarehouse = row.total_available - row.reserved;
          
          // Если у клиента есть резервация, проверяем её
          if (clientId) {
            db.get(`
              SELECT 
                SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available_in_reservation
              FROM reservation_products rp
              INNER JOIN reservations r ON rp.reservation_id = r.id
              WHERE rp.product_kod = ? 
                AND r.client_id = ? 
                AND r.status = 'aktywna'
            `, [kod, clientId], (err, reservationRow) => {
              if (err) {
                reject({ kod, error: err.message });
                return;
              }
              
              const availableInReservation = reservationRow ? (reservationRow.available_in_reservation || 0) : 0;
              
              // Если у клиента есть резервация, проверяем её
              if (availableInReservation > 0) {
                // Проверяем, не превышает ли СУММАРНОЕ запрашиваемое количество резервацию
                if (totalIlosc > availableInReservation) {
                  // ОТКЛОНЯЕМ заказ, если суммарное количество превышает резервацию
                  console.log(`❌ Order exceeds client reservation for ${kod}: requested ${totalIlosc}, available in reservation ${availableInReservation}`);
                  reject({ 
                    kod, 
                    nazwa, 
                    ilosc: totalIlosc, 
                    available: availableInReservation, 
                    error: 'Insufficient quantity',
                    message: `Przekroczona ilość w rezerwacji dla produktu "${nazwa}" (kod: ${kod}). Zamówiono: ${totalIlosc}, dostępne w rezerwacji: ${availableInReservation}`
                  });
                  return;
                }
                resolve({ 
                  kod, 
                  nazwa, 
                  ilosc: totalIlosc, 
                  available: availableInReservation,
                  fromReservation: true,
                  availableOnWarehouse: availableOnWarehouse
                });
        } else {
                // У клиента нет резервации - проверяем доступное на складе
                if (availableOnWarehouse < totalIlosc) {
                  reject({ kod, nazwa, ilosc: totalIlosc, available: availableOnWarehouse, error: 'Insufficient quantity' });
                } else {
                  resolve({ kod, nazwa, ilosc: totalIlosc, available: availableOnWarehouse, fromReservation: false });
                }
              }
            });
          } else {
            // Клиент не найден - проверяем доступное на складе
            if (availableOnWarehouse < totalIlosc) {
              reject({ kod, nazwa, ilosc: totalIlosc, available: availableOnWarehouse, error: 'Insufficient quantity' });
            } else {
              resolve({ kod, nazwa, ilosc: totalIlosc, available: availableOnWarehouse, fromReservation: false });
            }
        }
      });
    });
  });
  
  // Выполняем все проверки
  Promise.all(availabilityChecks)
    .then((results) => {
      console.log('✅ All products are available');
      
      // Создаем заказ
      db.run(
        'INSERT INTO orders (klient, numer_zamowienia, laczna_ilosc) VALUES (?, ?, ?)',
        [clientName, order_number, laczna_ilosc],
        function(err) {
          if (err) {
            console.error('❌ Database error creating order:', err);
            res.status(500).json({ error: err.message });
            return;
          }
          
          const orderId = this.lastID;
          console.log(`✅ Order created with ID: ${orderId}`);
          
          // Создаем записи для каждого продукта и обновляем working_sheets
          let productsCreated = 0;
          let productsFailed = 0;
          let workingSheetsUpdated = 0;
          
          products.forEach((product, index) => {
            const { kod, nazwa, ilosc, typ, kod_kreskowy } = product;
            
            // Находим информацию о доступности из результатов проверки
            const availabilityInfo = results.find(r => r.kod === kod);
            const fromReservation = availabilityInfo?.fromReservation || false;
            const availableOnWarehouse = availabilityInfo?.availableOnWarehouse || 0;
            
            // Определяем, сколько брать из резервации и сколько со склада
            // В ПЕРВУЮ ОЧЕРЕДЬ берем из резервации, затем со склада
            let quantityFromWarehouse = 0;
            let quantityFromReservation = 0;
            
            if (fromReservation) {
              // Товар из резервации клиента
              // Сначала берем из резервации: минимум из доступного в резервации и запрашиваемого
              const availableInReservation = availabilityInfo?.available || 0;
              quantityFromReservation = Math.min(availableInReservation, ilosc);
              // Остальное со склада
              quantityFromWarehouse = ilosc - quantityFromReservation;
            } else {
              // Товар полностью со склада
              quantityFromWarehouse = ilosc;
              quantityFromReservation = 0;
            }
            
            // Сначала создаем запись в order_products
            console.log(`📝 Creating order_products record for: ${kod} (orderId: ${orderId}, fromWarehouse: ${quantityFromWarehouse}, fromReservation: ${quantityFromReservation})`);
            db.run(
              'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ, kod_kreskowy) VALUES (?, ?, ?, ?, ?, ?)',
              [orderId, kod, nazwa, ilosc, typ || 'sprzedaz', kod_kreskowy || null],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating product ${index + 1}:`, err);
                  console.error(`❌ Error details:`, err.message);
                  productsFailed++;
                  checkCompletion();
                } else {
                  const orderProductId = this.lastID;
                  productsCreated++;
                  console.log(`✅ Product ${index + 1} created for order ${orderId} with ID: ${orderProductId}`);
                  
                  // Функция для продолжения после обновления резерваций
                  const proceedWithFIFO = () => {
                        // Теперь списываем по FIFO из products с отслеживанием
                    // Списываем всё количество заказа (фактическая отгрузка)
                        consumeFromProducts(kod, ilosc)
                          .then(({ consumed, remaining, consumptions }) => {
                            console.log(`🎯 FIFO consumption for ${kod}: ${consumed} szt. consumed`);
                            // Записываем списания партий в order_consumptions
                            if (consumptions && consumptions.length > 0) {
                              const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
                              const values = consumptions.flatMap(c => [orderId, kod, c.batchId, c.qty, c.cena || 0]);
                              db.run(
                                `INSERT INTO order_consumptions (order_id, product_kod, batch_id, quantity, batch_price) VALUES ${placeholders}`,
                                values,
                                (consErr) => {
                                  if (consErr) {
                                    console.error('❌ Error saving order_consumptions:', consErr);
                                  } else {
                                    console.log(`✅ Saved ${consumptions.length} consumption rows for order ${orderId}`);
                                  }
                      checkCompletion();
                                }
                              );
                            } else {
                              checkCompletion();
                            }
                          })
                          .catch((fifoError) => {
                            console.error(`❌ FIFO consumption error for ${kod}:`, fifoError);
                            checkCompletion();
                          });
                  };
                  
                  // Обновляем количество в working_sheets (всегда списываем ВСЁ количество заказа)
                  db.run(
                    'UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?',
                    [ilosc, kod],
                    function(updateErr) {
                      if (updateErr) {
                        console.error(`❌ Error updating working_sheets for product ${kod}:`, updateErr);
                        checkCompletion();
                      } else {
                        console.log(`✅ Updated working_sheets: ${kod} (quantity reduced by ${ilosc})`);
                        workingSheetsUpdated++;
                        
                        // Если товар берется из резервации, увеличиваем ilosc_wydane
                        if (quantityFromReservation > 0 && clientId) {
                          // Находим резервации клиента для этого товара и обновляем их
                          db.all(`
                            SELECT rp.id, rp.reservation_id, (rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available
                            FROM reservation_products rp
                            INNER JOIN reservations r ON rp.reservation_id = r.id
                            WHERE rp.product_kod = ? 
                              AND r.client_id = ? 
                              AND r.status = 'aktywna'
                            ORDER BY r.data_utworzenia ASC
                          `, [kod, clientId], (err, reservationProducts) => {
                            if (err) {
                              console.error(`❌ Error fetching reservation products for ${kod}:`, err);
                              // Продолжаем выполнение даже при ошибке
                              proceedWithFIFO();
                            } else if (reservationProducts.length === 0) {
                              console.log(`⚠️ No reservation products found for ${kod} and client ${clientId}`);
                              proceedWithFIFO();
                            } else {
                              // Распределяем количество по резервациям (FIFO)
                              let remainingToFulfill = quantityFromReservation;
                              let reservationsUpdated = 0;
                              
                              reservationProducts.forEach((rp) => {
                                if (remainingToFulfill <= 0) return;
                                
                                const toFulfill = Math.min(remainingToFulfill, rp.available);
                                
                                db.run(
                                  'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) + ? WHERE id = ?',
                                  [toFulfill, rp.id],
                                  function(updateErr) {
                                    if (updateErr) {
                                      console.error(`❌ Error updating reservation_product ${rp.id}:`, updateErr);
                                    } else {
                                      console.log(`✅ Updated reservation_product ${rp.id}: ilosc_wydane increased by ${toFulfill}`);
                                      
                                      // Записываем связь между резервацией и заказом
                                      db.run(
                                        'INSERT INTO reservation_order_fulfillments (reservation_product_id, order_id, order_product_id, quantity) VALUES (?, ?, ?, ?)',
                                        [rp.id, orderId, orderProductId, toFulfill],
                                        (fulfillErr) => {
                                          if (fulfillErr) {
                                            console.error(`❌ Error creating fulfillment record for reservation_product ${rp.id}:`, fulfillErr);
                                          } else {
                                            console.log(`✅ Created fulfillment record: reservation_product ${rp.id} -> order ${orderId}, quantity: ${toFulfill}`);
                                          }
                                        }
                                      );
                                      
                                      // Проверяем, полностью ли реализована резервация
                                      checkAndUpdateReservationStatus(rp.reservation_id);
                                    }
                                    
                                    reservationsUpdated++;
                                    remainingToFulfill -= toFulfill;
                                    
                                    if (reservationsUpdated === reservationProducts.length) {
                                      proceedWithFIFO();
                                    }
                                  }
                                );
                              });
                            }
                          });
                        } else {
                          proceedWithFIFO();
                        }
                      }
                    }
                  );
                }
              }
            );
          });
          
          function checkCompletion() {
            if (productsCreated + productsFailed === products.length) {
              if (res.headersSent) {
                console.log('⚠️ Response already sent, skipping checkCompletion');
                return;
              }
              
              if (productsFailed === 0) {
                console.log(`✅ All ${productsCreated} products created successfully for order ${orderId}`);
                console.log(`📊 Working sheets updated: ${workingSheetsUpdated} products`);
                res.json({ 
                  id: orderId, 
                  message: 'Order and all products added successfully',
                  productsCreated: productsCreated,
                  workingSheetsUpdated: workingSheetsUpdated,
                  success: true,
                  shouldClearForm: true
                });
              } else {
                console.log(`⚠️ Order created but ${productsFailed} products failed to create`);
                res.json({ 
                  id: orderId, 
                  message: `Order created but ${productsFailed} products failed to create`,
                  productsCreated: productsCreated,
                  productsFailed: productsFailed,
                  workingSheetsUpdated: workingSheetsUpdated,
                  success: false,
                  shouldClearForm: false
                });
              }
            }
          }
        }
      );
    })
    .catch((errors) => {
      // Обрабатываем ошибки доступности
      console.log('❌ Product availability check failed');
      
      if (Array.isArray(errors)) {
        // Если несколько ошибок, берем первую
        errors = errors[0];
      }
      
      const { kod, nazwa, ilosc, available, error, message: customMessage } = errors;
      
      if (error === 'Insufficient quantity') {
        console.log(`❌ Insufficient quantity for product ${kod} (${nazwa}): requested ${ilosc}, available ${available}`);
        res.status(400).json({ 
          error: 'Insufficient product quantity',
          details: {
            kod,
            nazwa,
            requested: ilosc,
            available: available,
            message: customMessage || `Niewystarczająca ilość produktu "${nazwa}" (kod: ${kod}). Zamówiono: ${ilosc}, dostępne: ${available}`
          }
        });
      } else if (error === 'Product not found in working_sheets') {
        console.log(`❌ Product ${kod} (${nazwa}) not found in working_sheets`);
        res.status(400).json({ 
          error: 'Product not found',
          details: {
            kod,
            nazwa,
            message: `Produkt "${nazwa}" (kod: ${kod}) nie został znaleziony w systemie`
          }
        });
      } else {
        console.log(`❌ Database error checking availability for product ${kod}:`, error);
        res.status(500).json({ 
          error: 'Database error during availability check',
          details: {
            kod,
            message: `Błąd bazy danych podczas sprawdzania dostępności produktu ${kod}`
          }
        });
      }
    });
});

// Хелпер: получить следующий номер резервации (глобально, вне зависимости от даты)
function getNextReservationNumber(dateString, callback) {
  if (!dateString) {
    return callback(new Error('Date parameter is required'));
  }

  const [year, month, day] = dateString.split('-');

  // Получаем все номера резерваций для поиска максимального номера
  db.all('SELECT numer_rezerwacji FROM reservations WHERE numer_rezerwacji LIKE ?', ['R%'], (err, allRows) => {
    if (err) return callback(err);
    
    // Извлекаем числовую часть из каждого номера и находим максимум
    let maxNumber = 0;
    const numbers = [];
    allRows.forEach(row => {
      const match = row.numer_rezerwacji.match(/^R(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        numbers.push(num);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });
    
    console.log(`📊 Reservation numbers analysis: found ${allRows.length} reservations, numbers: [${numbers.sort((a,b) => a-b).join(', ')}], max: ${maxNumber}`);
    
    const nextNumber = maxNumber + 1;
    const numer_rezerwacji = `R${nextNumber.toString().padStart(3, '0')}_${day}_${month}_${year}`;
    console.log(`✅ Generated next reservation number: ${numer_rezerwacji} (sequence: ${nextNumber}, date: ${day}/${month}/${year})`);
    
    callback(null, numer_rezerwacji, maxNumber, nextNumber);
  });
}

// Endpoint для получения следующего номера резервации (с датой, для обратной совместимости)
console.log('🔧 Registering GET /api/reservations/next-number endpoint');
app.get('/api/reservations/next-number', (req, res) => {
  const { date } = req.query;
  console.log('🔢 GET /api/reservations/next-number - Generating next reservation number');
  
  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }

  getNextReservationNumber(date, (err, numer_rezerwacji, maxNumber) => {
      if (err) {
      console.error('❌ Error finding max reservation number:', err);
        return res.status(500).json({ error: err.message });
      }
    console.log(`✅ Next reservation number: ${numer_rezerwacji} (max number: ${maxNumber})`);
      res.json({ numer_rezerwacji });
  });
});

});

// Endpoint для анулирования резервации
app.put('/api/reservations/:id/cancel', (req, res) => {
  const { id } = req.params;
  console.log(`📋 PUT /api/reservations/${id}/cancel - Cancelling reservation`);
  
  // Проверяем, существует ли резервация
  db.get('SELECT * FROM reservations WHERE id = ?', [id], (err, reservation) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!reservation) {
      res.status(404).json({ error: 'Rezerwacja nie znaleziona' });
      return;
    }
    
    if (reservation.status === 'anulowana') {
      res.status(400).json({ error: 'Rezerwacja jest już anulowana' });
      return;
    }
    
    // Обновляем статус на 'anulowana'
    db.run(
      'UPDATE reservations SET status = ? WHERE id = ?',
      ['anulowana', id],
      function(err) {
        if (err) {
          console.error('❌ Database error updating status:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`✅ Reservation ${id} cancelled successfully`);
        res.json({ success: true, message: 'Rezerwacja została anulowana' });
      }
    );
  });
});

// Endpoint для обновления резервации
app.put('/api/reservations/:id', (req, res) => {
  const { id } = req.params;
  const { klient, numer_rezerwacji, data_utworzenia, data_zakonczenia, status, komentarz, products } = req.body;
  console.log(`📋 PUT /api/reservations/${id} - Updating reservation`);
  
  // Валидация обязательных полей
  if (!klient || !klient.trim()) {
    console.log('❌ Validation failed: client name is required');
    res.status(400).json({ error: 'Wybierz klienta' });
    return;
  }
  
  if (!products || products.length === 0) {
    console.log('❌ Validation failed: products are required');
    res.status(400).json({ error: 'Dodaj produkty do rezerwacji' });
    return;
  }
  
  
  // Сначала находим client_id по имени клиента
  db.get('SELECT id FROM clients WHERE nazwa = ? LIMIT 1', [klient], (err, client) => {
    if (err) {
      console.error('❌ Database error finding client:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!client) {
      console.log('❌ Client not found:', klient);
      res.status(404).json({ error: 'Klient nie znaleziony' });
      return;
    }
    
    const clientId = client.id;
    
    // Получаем текущую резервацию и её продукты
    db.get('SELECT * FROM reservations WHERE id = ?', [id], (err, currentReservation) => {
      if (err) {
        console.error('❌ Database error fetching reservation:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (!currentReservation) {
        res.status(404).json({ error: 'Rezerwacja nie znaleziona' });
        return;
      }
      
      // Получаем текущие продукты резервации с ilosc_wydane
      db.all('SELECT * FROM reservation_products WHERE reservation_id = ?', [id], (err, oldProducts) => {
        if (err) {
          console.error('❌ Database error fetching old products:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        // Проверяем, изменился ли клиент и есть ли выданные товары
        const hasIssuedProducts = oldProducts.some(p => (p.ilosc_wydane || 0) > 0);
        if (hasIssuedProducts && currentReservation.client_id !== clientId) {
          console.log(`❌ Cannot change client - reservation has issued products`);
          res.status(400).json({ 
            error: 'Nie można zmienić klienta - część towaru z tej rezerwacji została już wydana' 
          });
          return;
        }
        
        // Создаём карту старых продуктов для быстрого доступа
        const oldProductsMap = {};
        oldProducts.forEach(p => {
          oldProductsMap[p.product_kod] = p;
        });
        
        // Валидация: проверяем что новое количество >= ilosc_wydane
      for (const product of products) {
        const oldProduct = oldProductsMap[product.kod];
        if (oldProduct) {
          const iloscWydane = oldProduct.ilosc_wydane || 0;
          if (product.ilosc < iloscWydane) {
            console.log(`❌ Validation failed: cannot reduce ${product.kod} below issued quantity (${iloscWydane})`);
            res.status(400).json({ 
              error: `Nie można zmniejszyć ilości produktu ${product.kod} poniżej wydanej ilości (${iloscWydane} szt.)` 
            });
            return;
          }
        }
      }
      
      // Проверяем доступность на складе для увеличенных количеств
      const checkAvailability = (callback) => {
        const productsToCheck = products.filter(p => {
          const oldProduct = oldProductsMap[p.kod];
          const oldQuantity = oldProduct ? oldProduct.ilosc : 0;
          return p.ilosc > oldQuantity;
        });
        
        if (productsToCheck.length === 0) {
          callback(null);
          return;
        }
        
        let checked = 0;
        let hasError = false;
        
        productsToCheck.forEach(product => {
          const oldProduct = oldProductsMap[product.kod];
          const oldQuantity = oldProduct ? oldProduct.ilosc : 0;
          const additionalNeeded = product.ilosc - oldQuantity;
          
          // Проверяем доступность на складе
          db.get(`
            SELECT 
              ws.ilosc as stock,
              COALESCE((
                SELECT SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0))
                FROM reservation_products rp
                INNER JOIN reservations r ON rp.reservation_id = r.id
                WHERE rp.product_kod = ws.kod AND r.status = 'aktywna' AND r.id != ?
              ), 0) as other_reserved
            FROM working_sheets ws
            WHERE ws.kod = ?
          `, [id, product.kod], (err, row) => {
            if (err || hasError) {
              if (!hasError) {
                console.error('❌ Error checking availability:', err);
              }
              checked++;
              return;
            }
            
            const stockQuantity = row ? row.stock : 0;
            const otherReserved = row ? row.other_reserved : 0;
            const availableForReserve = stockQuantity - otherReserved;
            
            console.log(`📊 Product ${product.kod}: stock=${stockQuantity}, otherReserved=${otherReserved}, available=${availableForReserve}, needed=${additionalNeeded}`);
            
            if (additionalNeeded > availableForReserve) {
              hasError = true;
              callback(`Niewystarczająca ilość produktu ${product.kod} - dostępne do rezerwacji: ${availableForReserve} szt.`);
              return;
            }
            
            checked++;
            if (checked === productsToCheck.length && !hasError) {
              callback(null);
            }
          });
        });
      };
      
      checkAvailability((error) => {
        if (error) {
          res.status(400).json({ error });
          return;
        }
        
        // Обновляем резервацию
        db.run(`
          UPDATE reservations 
          SET client_id = ?, numer_rezerwacji = ?, data_zakonczenia = ?, status = ?, komentarz = ?
          WHERE id = ?
        `, [clientId, numer_rezerwacji, data_zakonczenia, status, komentarz, id], function(err) {
          if (err) {
            console.error('❌ Database error updating reservation:', err);
            res.status(500).json({ error: err.message });
            return;
          }
          
          if (this.changes === 0) {
            res.status(404).json({ error: 'Rezerwacja nie znaleziona' });
            return;
          }
          
          // Умное обновление продуктов (сохраняем ilosc_wydane)
          smartUpdateReservationProducts(oldProductsMap);
        });
      });
      
      function smartUpdateReservationProducts(oldProductsMap) {
        console.log(`🧠 Smart update: processing ${products.length} products`);
        
        // ВАЖНО: Сначала СИНХРОННО определяем какие продукты нужно удалить
        // (те что есть в oldProductsMap, но нет в новом списке products)
        const productsToKeep = new Set(products.map(p => p.kod));
        const productsToDelete = Object.keys(oldProductsMap).filter(kod => !productsToKeep.has(kod));
        
        let operationsCompleted = 0;
        const totalOperations = products.length + productsToDelete.length;
        
        if (totalOperations === 0) {
          console.log(`✅ No operations needed, reservation ${id} unchanged`);
          res.json({ success: true, id: id });
          return;
        }
        
        const checkCompletion = () => {
          operationsCompleted++;
          if (operationsCompleted >= totalOperations) {
            console.log(`✅ Reservation ${id} updated successfully with ${products.length} products`);
            res.json({ success: true, id: id });
          }
        };
        
        // Обновляем или добавляем продукты
        products.forEach(product => {
          const oldProduct = oldProductsMap[product.kod];
          
          if (oldProduct) {
            // Продукт существует - обновляем количество, сохраняем ilosc_wydane
            db.run(`
              UPDATE reservation_products 
              SET ilosc = ?, product_nazwa = ?
              WHERE reservation_id = ? AND product_kod = ?
            `, [product.ilosc, product.nazwa, id, product.kod], (err) => {
              if (err) {
                console.error(`❌ Error updating product ${product.kod}:`, err);
              } else {
                console.log(`✅ Updated product ${product.kod}: ${oldProduct.ilosc} → ${product.ilosc}`);
              }
              checkCompletion();
            });
          } else {
            // Новый продукт - добавляем
            db.run(`
              INSERT INTO reservation_products (reservation_id, product_kod, product_nazwa, ilosc, ilosc_wydane)
              VALUES (?, ?, ?, ?, 0)
            `, [id, product.kod, product.nazwa, product.ilosc], (err) => {
              if (err) {
                console.error(`❌ Error inserting product ${product.kod}:`, err);
              } else {
                console.log(`✅ Inserted new product ${product.kod}: ${product.ilosc}`);
              }
              checkCompletion();
            });
          }
        });
        
        // Удаляем только те продукты, которых НЕТ в новом списке (и только если ilosc_wydane = 0)
        productsToDelete.forEach(kod => {
          const oldProduct = oldProductsMap[kod];
          if ((oldProduct.ilosc_wydane || 0) > 0) {
            console.log(`⚠️ Cannot delete product ${kod} - has issued quantity: ${oldProduct.ilosc_wydane}`);
            checkCompletion();
          } else {
            db.run(`
              DELETE FROM reservation_products 
              WHERE reservation_id = ? AND product_kod = ?
            `, [id, kod], (err) => {
              if (err) {
                console.error(`❌ Error deleting product ${kod}:`, err);
              } else {
                console.log(`✅ Deleted product ${kod}`);
              }
              checkCompletion();
            });
          }
        });
      }
    });
    });
  });
});

// Получение резерваций клиента по конкретному товару
app.get('/api/reservations/client/:client_id/products/:product_kod', (req, res) => {
  const { client_id, product_kod } = req.params;
  console.log(`📋 GET /api/reservations/client/${client_id}/products/${product_kod} - Fetching client reservations for product`);
  
  db.all(`
    SELECT 
      rp.id,
      rp.reservation_id,
      rp.ilosc,
      rp.ilosc_wydane,
      (rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available,
      r.numer_rezerwacji,
      r.data_utworzenia,
      r.data_zakonczenia
    FROM reservation_products rp
    INNER JOIN reservations r ON rp.reservation_id = r.id
    WHERE r.client_id = ? 
      AND rp.product_kod = ? 
      AND r.status = 'aktywna'
  `, [client_id, product_kod], (err, rows) => {
    if (err) {
      console.error('❌ Database error fetching client reservations:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!rows || rows.length === 0) {
      console.log(`✅ No active reservations found for client ${client_id} and product ${product_kod}`);
      res.json({ 
        hasReservation: false,
        totalAvailable: 0,
        reservations: []
      });
      return;
    }
    
    // Суммируем доступное количество из всех резерваций
    const totalAvailable = rows.reduce((sum, row) => sum + (row.available || 0), 0);
    
    console.log(`✅ Found ${rows.length} active reservations for client ${client_id} and product ${product_kod}, total available: ${totalAvailable}`);
    res.json({ 
      hasReservation: true,
      totalAvailable: totalAvailable,
      reservations: rows
    });
  });
});

// Получение всех резерваций с продуктами
app.get('/api/reservations-with-products', (req, res) => {
  console.log('📋 GET /api/reservations-with-products - Fetching all reservations with products');
  
  // Сначала проверяем истекшие резервации
  checkExpiredReservations();
  
  // Получаем все резервации с информацией о клиенте
  db.all(`
    SELECT 
      r.id,
      r.numer_rezerwacji,
      r.data_utworzenia,
      r.data_zakonczenia,
      r.status,
      r.komentarz,
      c.nazwa as klient_nazwa,
      c.firma as klient_firma
    FROM reservations r
    LEFT JOIN clients c ON r.client_id = c.id
    ORDER BY r.data_utworzenia DESC
  `, (err, reservations) => {
    if (err) {
      console.error('❌ Database error fetching reservations:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${reservations.length} reservations`);
    
    if (reservations.length === 0) {
      res.json([]);
      return;
    }
    
    // Для каждой резервации получаем продукты
    let processedReservations = 0;
    const result = [];
    
    reservations.forEach((reservation) => {
      db.all('SELECT * FROM reservation_products WHERE reservation_id = ?', [reservation.id], (err, products) => {
        if (err) {
          console.error(`❌ Database error fetching products for reservation ${reservation.id}:`, err);
        } else {
          console.log(`✅ Found ${products.length} products for reservation ${reservation.id}`);
        }
        
        // Вычисляем общее количество продуктов
        const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);
        
        // Формируем структуру резервации с продуктами
        const reservationWithProducts = {
          id: reservation.id,
          numer_rezerwacji: reservation.numer_rezerwacji,
          klient: reservation.klient_nazwa || '',
          firma: reservation.klient_firma || '',
          data_utworzenia: reservation.data_utworzenia,
          data_zakonczenia: reservation.data_zakonczenia,
          status: reservation.status,
          komentarz: reservation.komentarz,
          laczna_ilosc: laczna_ilosc,
          products: products || []
        };
        
        result.push(reservationWithProducts);
        processedReservations++;
        
        // Когда все резервации обработаны, отправляем результат
        if (processedReservations === reservations.length) {
          console.log(`✅ Sending ${result.length} reservations with products`);
          res.json(result);
        }
      });
    });
    });
});

// Endpoint для создания возвратов
app.post('/api/returns', (req, res) => {
  const { klient, data_zwrotu, products, orderId: originalOrderId } = req.body;
  console.log('📦 POST /api/returns - Creating new return:', { klient, data_zwrotu, productsCount: products?.length || 0, originalOrderId });
  
  if (!klient || !data_zwrotu || !products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: klient, data_zwrotu and products array are required');
    return res.status(400).json({ error: 'Client, return date and products array are required' });
  }
  
  // Проверяем, что для всех продуктов указана причина возврата
  const invalidProducts = products.filter(product => !product.powod_zwrotu);
  if (invalidProducts.length > 0) {
    console.log('❌ Validation failed: all products must have a return reason');
    return res.status(400).json({ error: 'All products must have a return reason' });
  }
  
  // Генерируем номер возврата: порядковый_номер_ZW_дата
  db.get('SELECT COUNT(*) as count FROM orders WHERE typ = "zwrot"', (err, row) => {
    if (err) {
      console.error('❌ Database error counting returns:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    const returnNumber = row.count + 1;
    const date = new Date(data_zwrotu);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const numer_zwrotu = `${returnNumber}_ZW_${day}.${month}.${year}`;
    
    console.log(`🔢 Generated return number: ${numer_zwrotu}`);
    
    // Вычисляем общее количество всех продуктов
    const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);
    
    // Создаем запись о возврате
    db.run(
      'INSERT INTO orders (klient, numer_zamowienia, laczna_ilosc, typ, numer_zwrotu, data_utworzenia) VALUES (?, ?, ?, ?, ?, ?)',
      [klient, returnNumber, laczna_ilosc, 'zwrot', numer_zwrotu, data_zwrotu],
      function(err) {
        if (err) {
          console.error('❌ Database error creating return:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        const returnId = this.lastID;
        console.log(`✅ Return created with ID: ${returnId}`);
        
        // Создаем записи для каждого продукта
        let productsCreated = 0;
        let productsFailed = 0;
        
        products.forEach((product, index) => {
          const { nazwa, ilosc, powod_zwrotu } = product;
          
          // Создаем запись в order_products
          db.run(
            'INSERT INTO order_products (orderId, nazwa, ilosc, powod_zwrotu, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [returnId, nazwa, ilosc, powod_zwrotu],
            function(err) {
              if (err) {
                console.error(`❌ Error creating return product ${index + 1}:`, err);
                productsFailed++;
                checkCompletion();
              } else {
                productsCreated++;
                console.log(`✅ Return product ${index + 1} created for return ${returnId}`);
                checkCompletion();
              }
            }
          );
        });
        
        // Восстанавливаем количество товара на склад в соответствующие партии
        if (originalOrderId) {
          restoreProductQuantitiesFromOrder(originalOrderId, products, () => {
            console.log(`✅ Product quantities restored for return ${returnId}`);
          });
        }
        
        function checkCompletion() {
          if (productsCreated + productsFailed === products.length) {
            if (res.headersSent) {
              console.log('⚠️ Response already sent, skipping checkCompletion');
              return;
            }
            
            if (productsFailed > 0) {
              console.log(`⚠️ Return created with ${productsFailed} failed products`);
              res.status(207).json({ 
                message: 'Return created with some failed products',
                returnId,
                productsCreated,
                productsFailed,
                numer_zwrotu
              });
            } else {
              console.log(`✅ Return ${returnId} completed successfully`);
              res.json({ 
                message: 'Return created successfully',
                returnId,
                productsCreated,
                numer_zwrotu
              });
            }
          }
        }
      }
    );
  });
});

// Функция для восстановления количества товара из заказа в соответствующие партии
function restoreProductQuantitiesFromOrder(orderId, products, callback) {
  console.log(`🔄 Restoring product quantities from order ${orderId}`);
  
  // Получаем информацию о потреблении для этого заказа
  db.all('SELECT * FROM order_consumptions WHERE order_id = ?', (err, consumptions) => {
    if (err) {
      console.error(`❌ Error fetching consumptions for order ${orderId}:`, err);
      callback();
            return;
          }
          
    if (!consumptions || consumptions.length === 0) {
      console.log(`ℹ️ No consumptions found for order ${orderId}`);
      callback();
      return;
    }
    
    console.log(`📊 Found ${consumptions.length} consumptions for order ${orderId}`);
    
    // Группируем потребления по продукту
    const consumptionsByProduct = {};
    consumptions.forEach(consumption => {
      if (!consumptionsByProduct[consumption.product_kod]) {
        consumptionsByProduct[consumption.product_kod] = [];
      }
      consumptionsByProduct[consumption.product_kod].push(consumption);
    });
    
    // Для каждого продукта в возврате восстанавливаем количество
    let productsProcessed = 0;
    products.forEach(product => {
      // Ищем потребления по названию продукта (так как в возврате у нас только nazwa)
      const productConsumptions = consumptionsByProduct[product.nazwa] || [];
      
      if (productConsumptions.length === 0) {
        console.log(`⚠️ No consumptions found for product ${product.nazwa} in order ${orderId}`);
        productsProcessed++;
        checkCompletion();
        return;
      }
      
      // Сортируем потребления по batch_id (FIFO - сначала старые)
      productConsumptions.sort((a, b) => a.batch_id - b.batch_id);
      
      let remainingQuantity = product.ilosc;
      let consumptionsProcessed = 0;
      
      productConsumptions.forEach(consumption => {
        if (remainingQuantity <= 0) {
          consumptionsProcessed++;
          checkProductCompletion();
          return;
        }
        
        const quantityToRestore = Math.min(remainingQuantity, consumption.quantity);
        
        // Восстанавливаем количество в products (FIFO)
        restoreToProducts(product.kod, quantityToRestore)
          .then(({ restored }) => {
            console.log(`✅ Restored ${restored} units in products for ${product.kod}`);
            consumptionsProcessed++;
            checkProductCompletion();
          })
          .catch((err) => {
            console.error(`❌ Error restoring quantity in products for ${product.kod}:`, err);
            consumptionsProcessed++;
            checkProductCompletion();
          });
        
        remainingQuantity -= quantityToRestore;
      });
      
      // Обновляем общее количество в working_sheets
      // Сначала находим kod продукта по названию
      db.get('SELECT kod FROM working_sheets WHERE nazwa = ?', [product.nazwa], (err, row) => {
        if (err) {
          console.error(`❌ Error finding kod for product ${product.nazwa}:`, err);
          return;
        }
        
        if (!row) {
          console.error(`❌ Product ${product.nazwa} not found in working_sheets`);
          return;
        }
        
        // Теперь обновляем количество по найденному kod
              db.run(
                'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
          [product.ilosc, row.kod],
          function(err) {
            if (err) {
              console.error(`❌ Error updating working_sheets for product ${product.nazwa}:`, err);
                  } else {
              console.log(`✅ Updated working_sheets: ${product.nazwa} (kod: ${row.kod}, quantity increased by ${product.ilosc})`);
            }
          }
        );
      });
      
      function checkProductCompletion() {
        if (consumptionsProcessed === productConsumptions.length) {
          productsProcessed++;
          checkCompletion();
            }
          }
        });
        
    function checkCompletion() {
      if (productsProcessed === products.length) {
        console.log(`✅ All product quantities restored for order ${orderId}`);
        callback();
      }
    }
  });
}

// Endpoint для получения следующего номера списания
app.get('/api/writeoffs/next-number-only', (req, res) => {
  console.log('🔢 GET /api/writeoffs/next-number-only - Generating next write-off number');
  
  // Получаем все номера списаний для поиска максимального номера (префикс RW)
  db.all('SELECT numer_zamowienia FROM orders WHERE typ = ? AND numer_zamowienia LIKE ?', ['odpisanie', 'RW%'], (err, allRows) => {
    if (err) {
      console.error('❌ Error finding max write-off number:', err);
      return res.status(500).json({ error: err.message });
    }
    
    console.log(`📋 Found ${allRows.length} write-offs with RW% pattern`);
    
    // Извлекаем числовую часть из каждого номера и находим максимум
    let maxNumber = 0;
    const numbers = [];
    allRows.forEach(row => {
      const match = row.numer_zamowienia.match(/^RW(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        numbers.push(num);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });
    
    console.log(`📊 Extracted numbers: [${numbers.sort((a,b) => a-b).join(', ')}], max: ${maxNumber}`);
    
    const nextNumber = maxNumber + 1;
    const numer_odpisania_only = `RW${nextNumber.toString().padStart(3, '0')}`;
    console.log(`✅ Generated next write-off number: ${numer_odpisania_only}`);
    res.json({ numer_odpisania: numer_odpisania_only });
  });
});

// Endpoint для получения следующего номера przychodu
app.get('/api/przychod/next-number-only', (req, res) => {
  console.log('🔢 GET /api/przychod/next-number-only - Generating next przychód number');
  
  // Получаем все номера przychodów для поиска максимального номера (префикс PW)
  db.all('SELECT numer_zamowienia FROM orders WHERE typ = ? AND numer_zamowienia LIKE ?', ['przychod', 'PW%'], (err, allRows) => {
    if (err) {
      console.error('❌ Error finding max przychód number:', err);
      return res.status(500).json({ error: err.message });
    }
    
    console.log(`📋 Found ${allRows.length} przychodów with PW% pattern`);
    
    // Извлекаем числовую часть из каждого номера и находим максимум
    let maxNumber = 0;
    const numbers = [];
    allRows.forEach(row => {
      const match = row.numer_zamowienia.match(/^PW(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        numbers.push(num);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    });
    
    console.log(`📊 Extracted numbers: [${numbers.sort((a,b) => a-b).join(', ')}], max: ${maxNumber}`);
    
    const nextNumber = maxNumber + 1;
    const numer_przychodu_only = `PW${nextNumber.toString().padStart(3, '0')}`;
    console.log(`✅ Generated next przychód number: ${numer_przychodu_only}`);
    res.json({ numer_przychodu: numer_przychodu_only });
  });
});

// ===== INVOICES ROUTES =====
// Список всех фактур (для вкладки Faktury)
app.get('/api/invoices', (req, res) => {
  console.log('📋 GET /api/invoices - Fetching all invoices');
  db.all(
    'SELECT id, numer_faktury, data_faktury, termin_platnosci, klient_nazwa, suma_netto, suma_vat, suma_brutto, rabat_suma FROM invoices ORDER BY data_faktury DESC, id DESC',
    (err, rows) => {
      if (err) {
        console.error('❌ Error fetching invoices:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(rows || []);
    }
  );
});

// Следующий номер фактуры (только числовая часть: 001, 002, …). Берём максимум по сохранённым номерам + 1.
app.get('/api/invoices/next-number-only', (req, res) => {
  console.log('🔢 GET /api/invoices/next-number-only - Next invoice number');
  db.all('SELECT numer_faktury FROM invoices', (err, rows) => {
    if (err) {
      console.error('❌ Error getting next invoice number:', err);
      return res.status(500).json({ error: err.message });
    }
    let maxNum = 0;
    (rows || []).forEach((r) => {
      const str = (r.numer_faktury || '').trim();
      // Формат "FV 240/2/2026" или "240" — извлекаем числовую часть до первого "/" или целиком
      const match = str.match(/^FV\s*(\d+)/i) || str.match(/^(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    const nextNum = maxNum + 1;
    const numer_faktury = nextNum.toString().padStart(3, '0');
    console.log(`✅ Next invoice number: ${numer_faktury} (max was: ${maxNum})`);
    res.json({ numer_faktury });
  });
});

// Получение деталей конкретной фактуры с продуктами
app.get('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📋 GET /api/invoices/${id} - Fetching invoice details`);
  
  // Получаем данные фактуры
  db.get(
    'SELECT * FROM invoices WHERE id = ?',
    [id],
    (err, invoice) => {
      if (err) {
        console.error(`❌ Error fetching invoice ${id}:`, err);
        return res.status(500).json({ error: err.message });
      }
      
      if (!invoice) {
        console.log(`❌ Invoice ${id} not found`);
        return res.status(404).json({ error: 'Invoice not found' });
      }
      
      // Получаем продукты фактуры
      db.all(
        'SELECT * FROM invoice_products WHERE invoice_id = ? ORDER BY id',
        [id],
        (err, products) => {
          if (err) {
            console.error(`❌ Error fetching products for invoice ${id}:`, err);
            return res.status(500).json({ error: err.message });
          }
          
          console.log(`✅ Invoice ${id} fetched with ${products?.length || 0} products`);
          res.json({
            ...invoice,
            products: products || []
          });
        }
      );
    }
  );
});

// Создание фактуры и позиций
app.post('/api/invoices', (req, res) => {
  const {
    data_faktury,
    numer_faktury,
    klient,
    order_id,
    numer_zamowienia,
    termin_platnosci,
    products,
    przesuniecie_products,
    suma_netto,
    suma_vat,
    total: suma_brutto,
    rabat_suma
  } = req.body;

  if (!data_faktury || !numer_faktury || !klient || !products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Wymagane: data_faktury, numer_faktury, klient i niepusta tablica products' });
  }

  const totalBrutto = parseFloat(suma_brutto);
  const totalNetto = parseFloat(suma_netto);
  const totalVat = parseFloat(suma_vat);
  const totalRabat = parseFloat(rabat_suma) || 0;
  if (isNaN(totalBrutto) || isNaN(totalNetto) || isNaN(totalVat)) {
    return res.status(400).json({ error: 'suma_netto, suma_vat i total muszą być liczbami' });
  }

  db.get('SELECT id, firma FROM clients WHERE nazwa = ?', [klient], (err, clientRow) => {
    if (err) {
      console.error('❌ Error looking up client:', err);
      return res.status(500).json({ error: err.message });
    }
    const client_id = clientRow ? clientRow.id : null;
    const klient_firma = clientRow ? (clientRow.firma || null) : null;

    db.run(
      `INSERT INTO invoices (
        numer_faktury, data_faktury, order_id, numer_zamowienia, termin_platnosci, client_id,
        klient_nazwa, klient_firma, suma_netto, suma_vat, suma_brutto, rabat_suma
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        numer_faktury,
        data_faktury,
        order_id || null,
        numer_zamowienia || null,
        termin_platnosci || null,
        client_id,
        klient,
        klient_firma,
        totalNetto,
        totalVat,
        totalBrutto,
        totalRabat
      ],
      function (runErr) {
        if (runErr) {
          console.error('❌ Error inserting invoice:', runErr);
          return res.status(500).json({ error: runErr.message });
        }
        const invoiceId = this.lastID;

        if (products.length === 0) {
          console.log(`✅ Invoice created: id=${invoiceId} ${numer_faktury}`);
          return res.json({ id: invoiceId, numer_faktury });
        }

        let pending = products.length;
        let hasError = false;

        products.forEach((p) => {
          const ilosc = parseFloat(p.ilosc) || 0;
          const cena_netto = parseFloat(p.cena_netto) || 0;
          const rabat = parseFloat(p.rabat) || 0;
          const vat = parseInt(p.vat, 10) || 23;
          const wartosc_netto = ilosc * cena_netto * (1 - rabat / 100);
          const wartosc_vat = wartosc_netto * (vat / 100);
          const wartosc_brutto = wartosc_netto + wartosc_vat;

          db.run(
            `INSERT INTO invoice_products (
              invoice_id, kod, nazwa, ilosc, cena_netto, rabat, vat_stawka,
              wartosc_netto, wartosc_vat, wartosc_brutto, order_product_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              invoiceId,
              p.kod || '',
              p.nazwa || '',
              ilosc,
              cena_netto,
              rabat,
              vat,
              Math.round(wartosc_netto * 100) / 100,
              Math.round(wartosc_vat * 100) / 100,
              Math.round(wartosc_brutto * 100) / 100,
              null
            ],
            (prodErr) => {
              if (hasError) return;
              if (prodErr) {
                hasError = true;
                console.error('❌ Error inserting invoice product:', prodErr);
                return res.status(500).json({ error: prodErr.message });
              }
              pending -= 1;
              if (pending === 0) {
                console.log(`✅ Invoice created: id=${invoiceId} ${numer_faktury}, ${products.length} positions`);
                createPrzesuniecieIfNeeded(invoiceId);
              }
            }
          );
        });
      }
    );
  });

  function createPrzesuniecieIfNeeded(invoiceId) {
    const items = Array.isArray(przesuniecie_products) ? przesuniecie_products : [];
    if (items.length === 0) {
      return res.json({ id: invoiceId, numer_faktury });
    }
    db.all(
      "SELECT numer_zamowienia FROM orders WHERE typ = 'przesuniecie' AND numer_zamowienia LIKE 'PS%'",
      (err, rows) => {
        if (err) {
          console.error('❌ Error fetching PS numbers:', err);
          return res.json({ id: invoiceId, numer_faktury });
        }
        let maxNum = 0;
        (rows || []).forEach((r) => {
          const m = (r.numer_zamowienia || '').match(/^PS(\d+)_/i);
          if (m) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n > maxNum) maxNum = n;
          }
        });
        const nextNum = maxNum + 1;
        const parts = (data_faktury || '').split('-');
        const year = parts[0] || new Date().getFullYear();
        const month = parts[1] || String(new Date().getMonth() + 1).padStart(2, '0');
        const day = parts[2] || String(new Date().getDate()).padStart(2, '0');
        const numer_ps = `PS${String(nextNum).padStart(3, '0')}_${day}_${month}_${year}`;
        const laczna = items.reduce((s, p) => s + Math.round(parseFloat(p.ilosc) || 0), 0);
        const dataUtworzenia = (data_faktury || '').trim() ? `${data_faktury} 00:00:00` : null;
        db.run(
          `INSERT INTO orders (klient, numer_zamowienia, data_utworzenia, laczna_ilosc, typ) VALUES (?, ?, COALESCE(?, datetime('now')), ?, 'przesuniecie')`,
          [klient, numer_ps, dataUtworzenia, laczna],
          function (runOrderErr) {
            if (runOrderErr) {
              console.error('❌ Error inserting Przesunięcie order:', runOrderErr);
              return res.json({ id: invoiceId, numer_faktury });
            }
            const psOrderId = this.lastID;
            let pend = items.length;
            let hasErr = false;
            items.forEach((p) => {
              const ilosc = Math.round(parseFloat(p.ilosc) || 0);
              db.run(
                `INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?)`,
                [psOrderId, p.kod || '', p.nazwa || '', ilosc, null],
                (opErr) => {
                  if (hasErr) return;
                  if (opErr) {
                    hasErr = true;
                    console.error('❌ Error inserting Przesunięcie product:', opErr);
                    return res.status(500).json({ error: opErr.message });
                  }
                  pend -= 1;
                  if (pend === 0) {
                    console.log(`✅ Przesunięcie created: ${numer_ps}, orderId=${psOrderId}`);
                    res.json({ id: invoiceId, numer_faktury });
                  }
                }
              );
            });
          }
        );
      }
    );
  }
});

// Endpoint для обновления фактуры
app.put('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  const {
    data_faktury,
    numer_faktury,
    klient,
    termin_platnosci,
    products,
    suma_netto,
    suma_vat,
    suma_brutto,
    rabat_suma
  } = req.body;

  console.log(`📝 PUT /api/invoices/${id} - Updating invoice`);

  if (!data_faktury || !numer_faktury || !klient || !products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Wymagane: data_faktury, numer_faktury, klient i niepusta tablica products' });
  }

  const totalBrutto = parseFloat(suma_brutto);
  const totalNetto = parseFloat(suma_netto);
  const totalVat = parseFloat(suma_vat);
  const totalRabat = parseFloat(rabat_suma) || 0;
  
  if (isNaN(totalBrutto) || isNaN(totalNetto) || isNaN(totalVat)) {
    return res.status(400).json({ error: 'suma_netto, suma_vat i suma_brutto muszą być liczbami' });
  }

  // Обновляем данные фактуры
  db.get('SELECT id, firma FROM clients WHERE nazwa = ?', [klient], (err, clientRow) => {
    if (err) {
      console.error('❌ Error looking up client:', err);
      return res.status(500).json({ error: err.message });
    }
    
    const client_id = clientRow ? clientRow.id : null;
    const klient_firma = clientRow ? (clientRow.firma || null) : null;

    db.run(
      `UPDATE invoices 
       SET numer_faktury = ?, data_faktury = ?, termin_platnosci = ?, client_id = ?,
           klient_nazwa = ?, klient_firma = ?, suma_netto = ?, suma_vat = ?, suma_brutto = ?, rabat_suma = ?
       WHERE id = ?`,
      [
        numer_faktury,
        data_faktury,
        termin_platnosci || null,
        client_id,
        klient,
        klient_firma,
        totalNetto,
        totalVat,
        totalBrutto,
        totalRabat,
        id
      ],
      function (updateErr) {
        if (updateErr) {
          console.error('❌ Error updating invoice:', updateErr);
          return res.status(500).json({ error: updateErr.message });
        }

        // Удаляем старые продукты
        db.run('DELETE FROM invoice_products WHERE invoice_id = ?', [id], (delErr) => {
          if (delErr) {
            console.error('❌ Error deleting old products:', delErr);
            return res.status(500).json({ error: delErr.message });
          }

          // Вставляем новые продукты
          let pending = products.length;
          let hasError = false;

          products.forEach((p) => {
            const ilosc = parseFloat(p.ilosc) || 0;
            const cena_netto = parseFloat(p.cena_netto) || 0;
            const rabat = parseFloat(p.rabat) || 0;
            const vat = parseInt(p.vat, 10) || 23;
            const wartosc_netto = ilosc * cena_netto * (1 - rabat / 100);
            const wartosc_vat = wartosc_netto * (vat / 100);
            const wartosc_brutto = wartosc_netto + wartosc_vat;

            db.run(
              `INSERT INTO invoice_products (
                invoice_id, kod, nazwa, ilosc, cena_netto, rabat, vat_stawka,
                wartosc_netto, wartosc_vat, wartosc_brutto, order_product_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                p.kod || '',
                p.nazwa || '',
                ilosc,
                cena_netto,
                rabat,
                vat,
                Math.round(wartosc_netto * 100) / 100,
                Math.round(wartosc_vat * 100) / 100,
                Math.round(wartosc_brutto * 100) / 100,
                null
              ],
              (prodErr) => {
                if (hasError) return;
                if (prodErr) {
                  hasError = true;
                  console.error('❌ Error inserting invoice product:', prodErr);
                  return res.status(500).json({ error: prodErr.message });
                }
                pending -= 1;
                if (pending === 0) {
                  console.log(`✅ Invoice updated: id=${id} ${numer_faktury}, ${products.length} positions`);
                  res.json({ id: parseInt(id), numer_faktury });
                }
              }
            );
          });
        });
      }
    );
  });
});

// Endpoint для создания przychodu (прихода товара)
app.post('/api/przychod', (req, res) => {
  const { data_przychodu, numer_przychodu, products } = req.body;
  console.log('📦 POST /api/przychod - Creating new przychód:', { data_przychodu, numer_przychodu, productsCount: products?.length || 0 });
  
  if (!data_przychodu || !numer_przychodu || !products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: data_przychodu, numer_przychodu and products array are required');
    return res.status(400).json({ error: 'Date, number and products array are required' });
  }

  // Вычисляем общее количество товаров
  const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);

  // Преобразуем дату в формат DATETIME SQLite
  let dataUtworzenia;
  if (data_przychodu) {
    const date = new Date(data_przychodu);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    dataUtworzenia = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } else {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    dataUtworzenia = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // Создаем запись в таблице orders с типом 'przychod'
  db.run(
    `INSERT INTO orders (klient, numer_zamowienia, data_utworzenia, laczna_ilosc, typ) VALUES (?, ?, ?, ?, ?)`,
    ['VEIS', numer_przychodu, dataUtworzenia, laczna_ilosc, 'przychod'],
    function(err) {
      if (err) {
        console.error('❌ Database error creating przychód:', err);
        return res.status(500).json({ error: err.message });
      }

      const przychodId = this.lastID;
      console.log(`✅ Przychód created with ID: ${przychodId}, number: ${numer_przychodu}`);

      // Добавляем продукты przychodu в order_products
      let productsCreated = 0;
      let productsFailed = 0;
      let workingSheetsUpdated = 0;

      products.forEach((product, index) => {
        const { kod, nazwa, ilosc, powod } = product;
        
        // Создаем запись в order_products (powod записываем в поле typ)
        console.log(`📝 Creating order_products record for przychód: ${kod} (przychodId: ${przychodId})`);
        db.run(
          `INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?)`,
          [przychodId, kod || '', nazwa, ilosc, powod || ''],
          function(err) {
            if (err) {
              console.error(`❌ Error creating przychód product ${index + 1}:`, err);
              productsFailed++;
              checkCompletion();
            } else {
              productsCreated++;
              console.log(`✅ Przychód product ${index + 1} created for przychód ${przychodId}`);
              
              // Увеличиваем количество в working_sheets (ПРИХОД товара)
              if (kod) {
                db.run(
                  'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
                  [ilosc, kod],
                  function(updateErr) {
                    if (updateErr) {
                      console.error(`❌ Error updating working_sheets for product ${kod}:`, updateErr);
                    } else {
                      workingSheetsUpdated++;
                      console.log(`✅ working_sheets updated for ${kod}: increased by ${ilosc}`);
                    }
                    checkCompletion();
                  }
                );
              } else {
                checkCompletion();
              }
            }
          }
        );
      });

      function checkCompletion() {
        if (productsCreated + productsFailed === products.length) {
          if (productsFailed > 0) {
            console.log(`⚠️ Przychód created with ${productsFailed} failed products`);
            res.status(207).json({ 
              message: 'Przychód created with some failed products',
              przychodId,
              productsCreated,
              productsFailed,
              workingSheetsUpdated,
              numer_przychodu
            });
          } else {
            console.log(`✅ Przychód ${przychodId} completed successfully`);
            res.json({ 
              message: 'Przychód created successfully',
              przychodId,
              productsCreated,
              workingSheetsUpdated,
              numer_przychodu
            });
          }
        }
      }
    }
  );
});

// Endpoint для создания списаний товаров (добавляем как заказ с типом 'odpisanie')
app.post('/api/writeoffs', (req, res) => {
  const { data_odpisania, numer_odpisania, products } = req.body;
  console.log('📦 POST /api/writeoffs - Creating new write-off:', { data_odpisania, numer_odpisania, productsCount: products?.length || 0 });
  
  if (!data_odpisania || !numer_odpisania || !products || !Array.isArray(products) || products.length === 0) {
    console.log('❌ Validation failed: data_odpisania, numer_odpisania and products array are required');
    return res.status(400).json({ error: 'Date, number and products array are required' });
  }

  // Вычисляем общее количество списанных товаров
  const laczna_ilosc = products.reduce((total, product) => total + (product.ilosc || 0), 0);

  // Преобразуем дату в формат DATETIME SQLite (YYYY-MM-DD HH:MM:SS)
  let dataUtworzenia;
  if (data_odpisania) {
    const date = new Date(data_odpisania);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    dataUtworzenia = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } else {
    // Если дата не указана, используем текущую дату и время
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    dataUtworzenia = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // 1. Проверяем доступность товаров (как при создании заказа)
  console.log('🔍 Checking product availability for write-off...');
  
  const availabilityChecks = products.map(product => {
    return new Promise((resolve, reject) => {
      const { kod, nazwa, ilosc } = product;
      
      // Проверяем доступное количество в working_sheets
      db.get(`
        SELECT 
          ws.ilosc as total_available,
          COALESCE(SUM(CASE 
            WHEN r.status = 'aktywna' 
            THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0)
            ELSE 0 
          END), 0) as reserved
        FROM working_sheets ws
        LEFT JOIN reservation_products rp ON ws.kod = rp.product_kod
        LEFT JOIN reservations r ON rp.reservation_id = r.id
        WHERE ws.kod = ?
        GROUP BY ws.kod, ws.ilosc
      `, [kod], (err, row) => {
        if (err) {
          reject({ kod, error: err.message });
          return;
        }
        
        if (!row) {
          reject({ kod, nazwa, ilosc, available: 0, error: 'Product not found in working_sheets' });
          return;
        }
        
        const availableQuantity = row.total_available - row.reserved;
        
        if (availableQuantity < ilosc) {
          reject({ kod, nazwa, ilosc, available: availableQuantity, error: 'Insufficient quantity' });
        } else {
          resolve({ kod, nazwa, ilosc, available: availableQuantity });
        }
      });
    });
  });
  
  // Выполняем все проверки
  Promise.all(availabilityChecks)
    .then((results) => {
      console.log('✅ All products are available for write-off');
      
      // 2. Создаем запись в таблице orders с типом 'odpisanie'
      db.run(
        `INSERT INTO orders (klient, numer_zamowienia, data_utworzenia, laczna_ilosc, typ) VALUES (?, ?, ?, ?, ?)`,
        ['VEIS', numer_odpisania, dataUtworzenia, laczna_ilosc, 'odpisanie'],
        function(err) {
          if (err) {
            console.error('❌ Database error creating write-off:', err);
            return res.status(500).json({ error: err.message });
          }

          const writeoffId = this.lastID;
          console.log(`✅ Write-off created with ID: ${writeoffId}, number: ${numer_odpisania}`);

          // 3. Добавляем продукты списания в order_products
          let productsCreated = 0;
          let productsFailed = 0;
          let workingSheetsUpdated = 0;

          products.forEach((product, index) => {
            const { kod, nazwa, ilosc, powod } = product;
            
            // Создаем запись в order_products (записываем powod в поле typ)
            console.log(`📝 Creating order_products record for write-off: ${kod} (writeoffId: ${writeoffId})`);
            db.run(
              `INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?)`,
              [writeoffId, kod || '', nazwa, ilosc, powod || ''],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating write-off product ${index + 1}:`, err);
                  productsFailed++;
                  checkCompletion();
                } else {
                  productsCreated++;
                  console.log(`✅ Write-off product ${index + 1} created for write-off ${writeoffId}`);
                  
                  // 4. FIFO списание через consumeFromProducts (как при создании заказа)
                  if (kod) {
                    consumeFromProducts(kod, ilosc)
                      .then(({ consumed, remaining, consumptions }) => {
                        console.log(`🎯 FIFO consumption for ${kod}: ${consumed} szt. consumed`);
                        
                        // 5. Записываем списания партий в order_consumptions
                        if (consumptions && consumptions.length > 0) {
                          const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
                          const values = consumptions.flatMap(c => [writeoffId, kod, c.batchId, c.qty, c.cena || 0]);
                          db.run(
                            `INSERT INTO order_consumptions (order_id, product_kod, batch_id, quantity, batch_price) VALUES ${placeholders}`,
                            values,
                            (consErr) => {
                              if (consErr) {
                                console.error('❌ Error saving order_consumptions for write-off:', consErr);
                              } else {
                                console.log(`✅ Saved ${consumptions.length} consumption rows for write-off ${writeoffId}`);
                              }
                              
                              // 6. Обновляем working_sheets (как при создании заказа)
                              updateWorkingSheets();
                            }
                          );
                        } else {
                          // Обновляем working_sheets даже если нет записей в order_consumptions
                          updateWorkingSheets();
                        }
                      })
                      .catch(fifoErr => {
                        console.error(`❌ Error in FIFO consumption for ${kod}:`, fifoErr);
                        // Всё равно обновляем working_sheets
                        updateWorkingSheets();
                      });
                  } else {
                    checkCompletion();
                  }
                  
                  function updateWorkingSheets() {
                    db.run(
                      'UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?',
                      [ilosc, kod],
                      function(updateErr) {
                        if (updateErr) {
                          console.error(`❌ Error updating working_sheets for product ${kod}:`, updateErr);
                        } else {
                          workingSheetsUpdated++;
                          console.log(`✅ working_sheets updated for ${kod}: reduced by ${ilosc}`);
                        }
                        checkCompletion();
                      }
                    );
                  }
                }
              }
            );
          });

          function checkCompletion() {
            if (productsCreated + productsFailed === products.length) {
              if (productsFailed > 0) {
                console.log(`⚠️ Write-off created with ${productsFailed} failed products`);
                res.status(207).json({ 
                  message: 'Write-off created with some failed products',
                  writeoffId,
                  productsCreated,
                  productsFailed,
                  workingSheetsUpdated,
                  numer_odpisania
                });
              } else {
                console.log(`✅ Write-off ${writeoffId} completed successfully`);
                res.json({ 
                  message: 'Write-off created successfully',
                  writeoffId,
                  productsCreated,
                  workingSheetsUpdated,
                  numer_odpisania
                });
              }
            }
          }
        }
      );
    })
    .catch((failedProduct) => {
      console.log(`❌ Product availability check failed:`, failedProduct);
      res.status(400).json({ 
        error: 'Insufficient quantity',
        product: failedProduct.kod,
        nazwa: failedProduct.nazwa,
        requested: failedProduct.ilosc,
        available: failedProduct.available
      });
    });
});

app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  let { klient, numer_zamowienia, products } = req.body;
  console.log(`📋 PUT /api/orders/${id} - Updating order:`, { klient, numer_zamowienia, productsCount: products?.length || 0 });
  
  if (!klient || !numer_zamowienia) {
    console.log('❌ Validation failed: klient and numer_zamowienia are required');
    return res.status(400).json({ error: 'Client name and order number are required' });
  }
  
  // Сначала проверяем тип заказа (для списаний клиент всегда VEIS)
  db.get('SELECT typ FROM orders WHERE id = ?', [id], (err, orderRow) => {
    if (err) {
      console.error('❌ Database error fetching order type:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!orderRow) {
      console.log(`❌ Order ${id} not found`);
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Для списаний и przychodów принудительно устанавливаем клиента VEIS
    if (orderRow.typ === 'odpisanie' || orderRow.typ === 'przychod') {
      klient = 'VEIS';
      console.log(`📝 ${orderRow.typ === 'przychod' ? 'Przychód' : 'Write-off'} detected, forcing client to VEIS`);
    }
    
    const orderType = orderRow.typ; // Сохраняем тип заказа для дальнейшего использования
    
    // Получаем clientId по имени клиента для обработки резерваций
    const clientName = klient.trim();
    db.get('SELECT id FROM clients WHERE LOWER(TRIM(nazwa)) = LOWER(?)', [clientName], (err, clientRow) => {
      if (err) {
        console.error('❌ Database error fetching client:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      const clientId = clientRow ? clientRow.id : null;
      console.log(`🔍 Client ID for "${clientName}": ${clientId || 'not found'}`);
    
      // Получаем старые продукты заказа для восстановления количества в working_sheets
      db.all('SELECT * FROM order_products WHERE orderId = ?', [id], (err, oldOrderProducts) => {
        if (err) {
          console.error('❌ Database error fetching old order products:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`🔄 Found ${oldOrderProducts.length} old products to restore in working_sheets`);
        console.log(`🔍 Old order products:`, JSON.stringify(oldOrderProducts, null, 2));
        
        // Вычисляем общее количество всех продуктов
        const laczna_ilosc = products ? products.reduce((total, product) => total + (product.ilosc || 0), 0) : 0;
        
        // Обновляем основную информацию о заказе
        db.run(
          'UPDATE orders SET klient = ?, numer_zamowienia = ?, laczna_ilosc = ? WHERE id = ?',
          [klient, numer_zamowienia, laczna_ilosc, id],
          function(err) {
            if (err) {
              console.error('❌ Database error updating order:', err);
              res.status(500).json({ error: err.message });
              return;
            }
            
            console.log(`✅ Order ${id} updated successfully`);

            // Умное обновление продуктов заказа
            smartUpdateOrderProducts(oldOrderProducts, clientId, orderType);
          }
        );
      });
    });
  });

  function smartUpdateOrderProducts(oldOrderProducts, clientId, orderType) {
    console.log(`🧠 Smart update: processing ${products.length} new products against ${oldOrderProducts.length} existing products (clientId: ${clientId}, orderType: ${orderType})`);
    
    // Создаем карты для быстрого поиска - используем массивы для каждого ключа
    const oldProductsMap = {};
    const newProductsMap = {};
    
    oldOrderProducts.forEach(product => {
      const key = `${product.kod}_${product.typ || 'sprzedaz'}`;
      if (!oldProductsMap[key]) {
        oldProductsMap[key] = [];
      }
      oldProductsMap[key].push(product);
    });
    
    products.forEach(product => {
      const key = `${product.kod}_${product.typ || 'sprzedaz'}`;
      if (!newProductsMap[key]) {
        newProductsMap[key] = [];
      }
      newProductsMap[key].push(product);
    });
    
    console.log(`🔍 Old products map:`, Object.keys(oldProductsMap).map(k => `${k}: ${oldProductsMap[k].length} items`));
    console.log(`🔍 New products map:`, Object.keys(newProductsMap).map(k => `${k}: ${newProductsMap[k].length} items`));
    
    let operationsCompleted = 0;
    let totalOperations = 0;
    
    // Подсчитываем общее количество операций
    const operationsToProcess = [];
    
    // 1. Обрабатываем все комбинации старых и новых продуктов
    Object.keys(newProductsMap).forEach(key => {
      const newProducts = newProductsMap[key];
      const oldProducts = oldProductsMap[key] || [];
      
      // Сопоставляем старые и новые продукты по порядку
      const maxLength = Math.max(newProducts.length, oldProducts.length);
      
      for (let i = 0; i < maxLength; i++) {
        const newProduct = newProducts[i];
        const oldProduct = oldProducts[i];
        
        if (oldProduct && newProduct) {
          // Продукт существует - обновляем
          operationsToProcess.push({
            type: 'update',
            oldProduct,
            newProduct,
            key: `${key}_${i}`
          });
        } else if (newProduct && !oldProduct) {
          // Новый продукт - добавляем
          operationsToProcess.push({
            type: 'insert',
            newProduct,
            key: `${key}_${i}`
          });
        } else if (oldProduct && !newProduct) {
          // Старый продукт больше не нужен - удаляем
          operationsToProcess.push({
            type: 'delete',
            oldProduct,
            key: `${key}_${i}`
          });
        }
      }
    });
    
    // 2. Удаляем продукты, которых больше нет в новом списке (для ключей, которых нет в newProductsMap)
    Object.keys(oldProductsMap).forEach(key => {
      if (!newProductsMap[key]) {
        oldProductsMap[key].forEach((oldProduct, index) => {
          operationsToProcess.push({
            type: 'delete',
            oldProduct,
            key: `${key}_${index}`
          });
        });
      }
    });
    
    totalOperations = operationsToProcess.length;
    console.log(`📊 Total operations to perform: ${totalOperations}`);
    
    if (totalOperations === 0) {
      console.log(`💡 No changes needed`);
      res.json({ 
        message: 'Order updated successfully - no product changes',
        operationsPerformed: 0
      });
            return;
          }
          
    // Выполняем операции
    operationsToProcess.forEach(operation => {
      switch (operation.type) {
        case 'update':
          updateExistingProduct(operation.oldProduct, operation.newProduct, operation.key);
          break;
        case 'insert':
          insertNewProduct(operation.newProduct, operation.key);
          break;
        case 'delete':
          deleteUnusedProduct(operation.oldProduct, operation.key);
          break;
      }
    });
    
    function updateExistingProduct(oldProduct, newProduct, key) {
      const { kod, nazwa, ilosc, typ, kod_kreskowy } = newProduct;
      const oldQuantity = Number(oldProduct.ilosc);
      const newQuantity = Number(ilosc);
      const quantityDiff = newQuantity - oldQuantity;
      const orderProductId = oldProduct.id;
      
      console.log(`🔄 Updating existing product ${key}: ${oldQuantity} → ${newQuantity} (diff: ${quantityDiff})`);
      
      // Обновляем запись в order_products
      db.run(
        'UPDATE order_products SET ilosc = ?, nazwa = ?, kod_kreskowy = ? WHERE id = ?',
        [ilosc, nazwa, kod_kreskowy || null, oldProduct.id],
        function(err) {
          if (err) {
            console.error(`❌ Error updating product ${key}:`, err);
            operationCompleted();
            return;
          }
          
          console.log(`✅ Updated product ${key} (ID: ${oldProduct.id})`);

          if (quantityDiff > 0) {
            console.log(`📈 Quantity increased by ${quantityDiff}`);
            // Для przychodu логика обратная - увеличиваем working_sheets
            if (orderType === 'przychod') {
              handlePrzychodQuantityIncrease(kod, quantityDiff, () => {
                operationCompleted();
              });
            } else {
              // Для обычных заказов и rozchodu - используем стандартную логику
              handleQuantityIncrease(kod, quantityDiff, orderProductId, () => {
                operationCompleted();
              });
            }
          } else if (quantityDiff < 0) {
            console.log(`📉 Quantity decreased by ${Math.abs(quantityDiff)}`);
            // Для przychodu логика обратная - уменьшаем working_sheets
            if (orderType === 'przychod') {
              handlePrzychodQuantityDecrease(kod, Math.abs(quantityDiff), () => {
                operationCompleted();
              });
            } else {
              // Для обычных заказов и rozchodu - используем стандартную логику
              handleQuantityDecrease(kod, Math.abs(quantityDiff), orderProductId, () => {
                operationCompleted();
              });
            }
          } else {
            console.log(`➡️ Quantity unchanged`);
            operationCompleted();
          }
        }
      );
    }
    
    // Новая функция для увеличения количества (как в POST)
    function handleQuantityIncrease(kod, quantity, orderProductId, callback) {
      console.log(`🔄 handleQuantityIncrease: ${kod} +${quantity} (clientId: ${clientId})`);
      
      // 1. Сначала обновляем working_sheets
      db.run(
        'UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?',
        [quantity, kod],
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error updating working_sheets for ${kod}:`, updateErr);
            callback();
            return;
          }
          console.log(`✅ Updated working_sheets: ${kod} (quantity reduced by ${quantity})`);
          
          // 2. Проверяем, есть ли у клиента резервация
          if (clientId) {
            db.get(`
              SELECT SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available_in_reservation
              FROM reservation_products rp
              INNER JOIN reservations r ON rp.reservation_id = r.id
              WHERE rp.product_kod = ? AND r.client_id = ? AND r.status = 'aktywna'
            `, [kod, clientId], (err, reservationRow) => {
              if (err) {
                console.error(`❌ Error checking reservation for ${kod}:`, err);
                proceedWithFIFO();
                return;
              }
              
              const availableInReservation = reservationRow?.available_in_reservation || 0;
              const quantityFromReservation = Math.min(availableInReservation, quantity);
              
              console.log(`🔍 Client ${clientId} reservation for ${kod}: available=${availableInReservation}, will use=${quantityFromReservation}`);
              
              if (quantityFromReservation > 0) {
                // Обновляем ilosc_wydane в резервациях
                db.all(`
                  SELECT rp.id, rp.reservation_id, (rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available
                  FROM reservation_products rp
                  INNER JOIN reservations r ON rp.reservation_id = r.id
                  WHERE rp.product_kod = ? AND r.client_id = ? AND r.status = 'aktywna'
                  ORDER BY r.data_utworzenia ASC
                `, [kod, clientId], (err, reservationProducts) => {
                  if (err || reservationProducts.length === 0) {
                    console.log(`⚠️ No reservation products found for ${kod}`);
                    proceedWithFIFO();
                    return;
                  }
                  
                  let remainingToFulfill = quantityFromReservation;
                  let reservationsUpdated = 0;
                  
                  reservationProducts.forEach((rp) => {
                    if (remainingToFulfill <= 0) {
                      reservationsUpdated++;
                      if (reservationsUpdated === reservationProducts.length) {
                        proceedWithFIFO();
                      }
                      return;
                    }
                    
                    const toFulfill = Math.min(remainingToFulfill, rp.available);
                    
                    db.run(
                      'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) + ? WHERE id = ?',
                      [toFulfill, rp.id],
                      function(updateErr) {
                        if (updateErr) {
                          console.error(`❌ Error updating reservation_product ${rp.id}:`, updateErr);
                        } else {
                          console.log(`✅ Updated reservation_product ${rp.id}: ilosc_wydane +${toFulfill}`);
                          
                          // Записываем связь резервации с заказом
                          db.run(
                            'INSERT INTO reservation_order_fulfillments (reservation_product_id, order_id, order_product_id, quantity) VALUES (?, ?, ?, ?)',
                            [rp.id, id, orderProductId, toFulfill],
                            (fulfillErr) => {
                              if (fulfillErr) {
                                console.error(`❌ Error creating fulfillment:`, fulfillErr);
                              } else {
                                console.log(`✅ Created fulfillment: reservation_product ${rp.id} -> order ${id}`);
                              }
                            }
                          );
                          
                          checkAndUpdateReservationStatus(rp.reservation_id);
                        }
                        
                        reservationsUpdated++;
                        remainingToFulfill -= toFulfill;
                        
                        if (reservationsUpdated === reservationProducts.length) {
                          proceedWithFIFO();
                        }
                      }
                    );
                  });
                });
              } else {
                proceedWithFIFO();
              }
            });
          } else {
            proceedWithFIFO();
          }
          
          function proceedWithFIFO() {
            // 3. FIFO списание из партий
            consumeFromProducts(kod, quantity)
              .then(({ consumed, remaining, consumptions }) => {
                console.log(`🎯 FIFO consumption for ${kod}: ${consumed} szt. consumed`);
                if (consumptions && consumptions.length > 0) {
                  const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
                  const values = consumptions.flatMap(c => [id, kod, c.batchId, c.qty, c.cena || 0]);
                  db.run(
                    `INSERT INTO order_consumptions (order_id, product_kod, batch_id, quantity, batch_price) VALUES ${placeholders}`,
                    values,
                    (consErr) => {
                      if (consErr) {
                        console.error('❌ Error saving order_consumptions:', consErr);
                      } else {
                        console.log(`✅ Saved ${consumptions.length} consumption rows`);
                      }
                      callback();
                    }
                  );
                } else {
                  callback();
                }
              })
              .catch((fifoError) => {
                console.error(`❌ FIFO error for ${kod}:`, fifoError);
                callback();
              });
          }
        }
      );
    }
    
    // Новая функция для уменьшения количества
    function handleQuantityDecrease(kod, quantity, orderProductId, callback) {
      console.log(`🔄 handleQuantityDecrease: ${kod} -${quantity}`);

      // Вызываем существующую функцию processQuantityDecrease
      processQuantityDecrease(kod, quantity, callback);
    }

    // Специальные функции для przychod (обратная логика)
    function handlePrzychodQuantityIncrease(kod, quantity, callback) {
      console.log(`🔄 handlePrzychodQuantityIncrease (przychód): ${kod} +${quantity} (увеличиваем working_sheets)`);
      
      // Для przychodu увеличение количества = увеличение на складе
      db.run(
        'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
        [quantity, kod],
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error updating working_sheets for ${kod}:`, updateErr);
          } else {
            console.log(`✅ Updated working_sheets: ${kod} (quantity increased by ${quantity})`);
          }
          callback();
        }
      );
    }

    function handlePrzychodQuantityDecrease(kod, quantity, callback) {
      console.log(`🔄 handlePrzychodQuantityDecrease (przychód): ${kod} -${quantity} (уменьшаем working_sheets)`);
      
      // Для przychodu уменьшение количества = уменьшение на складе
      db.run(
        'UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?',
        [quantity, kod],
        function(updateErr) {
          if (updateErr) {
            console.error(`❌ Error updating working_sheets for ${kod}:`, updateErr);
          } else {
            console.log(`✅ Updated working_sheets: ${kod} (quantity decreased by ${quantity})`);
          }
          callback();
        }
      );
    }
    
    function insertNewProduct(newProduct, key) {
      const { kod, nazwa, ilosc, typ, kod_kreskowy } = newProduct;

      console.log(`➕ Inserting new product ${key}: ${ilosc} units`);

      // Создаем новую запись в order_products
      db.run(
        'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ, kod_kreskowy) VALUES (?, ?, ?, ?, ?, ?)',
        [id, kod, nazwa, ilosc, typ || 'sprzedaz', kod_kreskowy || null],
        function(err) {
          if (err) {
            console.error(`❌ Error inserting product ${key}:`, err);
            operationCompleted();
          } else {
            const orderProductId = this.lastID;
            console.log(`✅ Inserted new product ${key} (ID: ${orderProductId})`);

            // Для przychodu используем специальную функцию
            if (orderType === 'przychod') {
              handlePrzychodQuantityIncrease(kod, Number(ilosc), () => {
                operationCompleted();
              });
            } else {
              // Используем новую функцию handleQuantityIncrease (как в POST)
              handleQuantityIncrease(kod, Number(ilosc), orderProductId, () => {
                operationCompleted();
              });
            }
          }
        }
      );
    }
    
    function deleteUnusedProduct(oldProduct, key) {
      const { kod, ilosc } = oldProduct;
      
      console.log(`🗑️ Deleting unused product ${key}: ${ilosc} units`);
      
      // Проверяем, есть ли новый продукт с тем же кодом (замена типа)
      const newProductWithSameCode = products.find(p => p.kod === kod && p.typ !== oldProduct.typ);
      
      if (newProductWithSameCode) {
        // Это замена типа - обновляем order_consumptions вместо удаления
        console.log(`🔄 Type replacement detected: ${oldProduct.typ} → ${newProductWithSameCode.typ}`);
        
        // Обновляем order_consumptions для связи с новым продуктом
        db.run(
          'UPDATE order_consumptions SET product_kod = ? WHERE order_id = ? AND product_kod = ?',
          [kod, id, kod], // product_kod остается тем же, но связь обновляется
          function(err) {
            if (err) {
              console.error(`❌ Error updating order_consumptions for ${key}:`, err);
            } else {
              console.log(`✅ Updated order_consumptions for type replacement ${key}`);
            }
            
            // Удаляем старую запись из order_products
            db.run(
              'DELETE FROM order_products WHERE id = ?',
              [oldProduct.id],
              function(deleteErr) {
                if (deleteErr) {
                  console.error(`❌ Error deleting product ${key}:`, deleteErr);
                  operationCompleted();
                } else {
                  console.log(`✅ Deleted old product ${key} (ID: ${oldProduct.id})`);

                  // Восстанавливаем количество в working_sheets
                  // Для przychodu используем специальную функцию
                  if (orderType === 'przychod') {
                    handlePrzychodQuantityDecrease(kod, Number(ilosc), () => {
                      operationCompleted();
                    });
                  } else {
                    processQuantityDecrease(kod, Number(ilosc), () => {
                      operationCompleted();
                    });
                  }
                }
              }
            );
          }
        );
      } else {
        // Обычное удаление продукта
        db.run(
          'DELETE FROM order_products WHERE id = ?',
          [oldProduct.id],
          function(err) {
            if (err) {
              console.error(`❌ Error deleting product ${key}:`, err);
              operationCompleted();
            } else {
              console.log(`✅ Deleted unused product ${key} (ID: ${oldProduct.id})`);

              // Восстанавливаем количество в working_sheets
              // Для przychodu используем специальную функцию
              if (orderType === 'przychod') {
                handlePrzychodQuantityDecrease(kod, Number(ilosc), () => {
                  operationCompleted();
                });
              } else {
                processQuantityDecrease(kod, Number(ilosc), () => {
                  operationCompleted();
                });
              }
            }
      }
    );
      }
    }
    
    function operationCompleted() {
      operationsCompleted++;
      console.log(`📊 Operations completed: ${operationsCompleted}/${totalOperations}`);
      
      if (operationsCompleted === totalOperations) {
        console.log(`✅ Smart update complete: ${totalOperations} operations performed`);
        res.json({ 
          message: 'Order updated successfully with smart product management',
          operationsPerformed: totalOperations
        });
      }
    }
  }
  
  function processQuantityChanges(oldOrderProducts) {
    if (!products || products.length === 0) {
      console.log('💡 No new products to process');
      res.json({ 
        message: 'Order updated successfully',
        workingSheetsUpdated: 0,
        workingSheetsRestored: 0
      });
      return;
    }
    
    console.log(`🔄 Processing quantity changes for ${products.length} products`);
    
    // Создаем map старых продуктов для быстрого поиска (по коду + типу)
    const oldProductsMap = {};
    oldOrderProducts.forEach(product => {
      const key = `${product.kod}_${product.typ || 'sprzedaz'}`;
      oldProductsMap[key] = product;
    });
    
    console.log(`🔍 Old products map:`, JSON.stringify(oldProductsMap, null, 2));
    console.log(`🔍 New products:`, JSON.stringify(products, null, 2));
    
    // Анализируем изменения для каждого продукта
    let productsProcessed = 0;
    let totalProducts = products.length;
          
          products.forEach((product, index) => {
            const { kod, nazwa, ilosc, typ, kod_kreskowy } = product;
            const key = `${kod}_${typ || 'sprzedaz'}`;
            const oldProduct = oldProductsMap[key];
            const oldQuantity = oldProduct ? Number(oldProduct.ilosc) : 0;
            const newQuantity = Number(ilosc);
            const quantityDiff = newQuantity - oldQuantity;
            
            console.log(`🔍 Product comparison for ${kod} (${typ || 'sprzedaz'}):`);
            console.log(`  - Search key: ${key}`);
            console.log(`  - New product: ${kod} x${newQuantity} (${typ || 'sprzedaz'})`);
            console.log(`  - Old product: ${oldProduct ? `${oldProduct.kod} x${oldProduct.ilosc} (${oldProduct.typ || 'sprzedaz'})` : 'NOT FOUND'}`);
            console.log(`  - Quantity diff: ${quantityDiff}`);
            console.log(`  - Action: ${quantityDiff > 0 ? 'INCREASE' : quantityDiff < 0 ? 'DECREASE' : 'NO CHANGE'}`);
      
              console.log(`📊 Product ${kod}: was ${oldQuantity}, now ${newQuantity}, diff: ${quantityDiff > 0 ? '+' : ''}${quantityDiff}`);
        console.log(`🔍 Debug: oldProduct = ${JSON.stringify(oldProduct)}, quantityDiff calculation: ${newQuantity} - ${oldQuantity} = ${quantityDiff}`);
            
            // Создаем запись в order_products
            db.run(
              'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ, kod_kreskowy) VALUES (?, ?, ?, ?, ?, ?)',
              [id, kod, nazwa, ilosc, typ || 'sprzedaz', kod_kreskowy || null],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating new product ${index + 1}:`, err);
            productsProcessed++;
                  checkCompletion();
                } else {
                  console.log(`✅ New product ${index + 1} created for order ${id}`);
                  
            // Обрабатываем изменения в количестве
            console.log(`🔍 Processing quantity changes for ${kod}: quantityDiff = ${quantityDiff}`);
            
            // Если продукт новый (не найден в старых), проверяем логику замены типа
            if (!oldProduct) {
              // Проверяем, есть ли продукт с таким же кодом, но другим типом
              const sameCodeProduct = oldOrderProducts.find(p => p.kod === kod && p.typ !== (typ || 'sprzedaz'));
              
              if (sameCodeProduct) {
                // Это замена типа - анализируем, что происходит
                const oldTypeQuantity = sameCodeProduct.ilosc;
                const newTypeQuantity = newQuantity;
                
                console.log(`🔄 Type replacement detected for ${kod}: ${sameCodeProduct.typ || 'sprzedaz'} → ${typ || 'sprzedaz'}`);
                console.log(`📊 Old type quantity: ${oldTypeQuantity}, New type quantity: ${newTypeQuantity}`);
                
                if (newTypeQuantity === 0) {
                  // Новый тип с количеством 0 = удаление старого типа
                  console.log(`🗑️ Removing old type ${sameCodeProduct.typ || 'sprzedaz'} (quantity: ${oldTypeQuantity})`);
                  processQuantityDecrease(kod, oldTypeQuantity, () => {
                    productsProcessed++;
                    checkCompletion();
                  });
                } else {
                  // Замена типа с новым количеством
                  const quantityDiff = newTypeQuantity - oldTypeQuantity;
                  console.log(`📈 Type replacement: ${quantityDiff > 0 ? 'increase' : 'decrease'} by ${Math.abs(quantityDiff)}`);
                  
                  if (quantityDiff > 0) {
                    // Новое количество больше - списываем разницу
                    processQuantityIncrease(kod, quantityDiff, () => {
                      productsProcessed++;
                      checkCompletion();
                    });
                  } else if (quantityDiff < 0) {
                    // Новое количество меньше - восстанавливаем разницу
                    processQuantityDecrease(kod, Math.abs(quantityDiff), () => {
                      productsProcessed++;
                      checkCompletion();
                    });
                  } else {
                    // Количество одинаковое - только замена типа
                    console.log(`🔄 Type changed, quantity unchanged`);
                    productsProcessed++;
                    checkCompletion();
                  }
                }
              } else {
                // Действительно новый продукт
                console.log(`➕ New product ${kod}: processing ${newQuantity} units`);
                processQuantityIncrease(kod, newQuantity, () => {
                  productsProcessed++;
                  checkCompletion();
                });
              }
            } else if (quantityDiff !== 0) {
              if (quantityDiff > 0) {
                // Количество увеличилось - списываем разницу
                console.log(`📈 Product ${kod}: quantity increased by ${quantityDiff}`);
                processQuantityIncrease(kod, quantityDiff, () => {
                  productsProcessed++;
                  checkCompletion();
                });
              } else {
                // Количество уменьшилось - восстанавливаем разницу
                const restoreQuantity = Math.abs(quantityDiff);
                console.log(`📉 Product ${kod}: quantity decreased by ${restoreQuantity}`);
                processQuantityDecrease(kod, restoreQuantity, () => {
                  productsProcessed++;
                  checkCompletion();
                });
              }
            } else {
              // Количество не изменилось - проверяем синхронизацию с working_sheets
              console.log(`➡️ Product ${kod}: quantity unchanged, checking working_sheets sync`);
              db.get('SELECT ilosc FROM working_sheets WHERE kod = ?', [kod], (err, row) => {
                if (err) {
                  console.error(`❌ Error checking working_sheets for ${kod}:`, err);
              productsProcessed++;
              checkCompletion();
                  return;
                }
                
                if (!row) {
                  console.log(`⚠️ Product ${kod} not found in working_sheets`);
                  productsProcessed++;
                  checkCompletion();
                  return;
                }
                
                console.log(`📊 working_sheets sync check: order quantity = ${ilosc}, working_sheets quantity = ${row.ilosc}`);
                productsProcessed++;
                checkCompletion();
              });
            }
          }
        }
      );
    });
    
    function checkCompletion() {
      if (productsProcessed === totalProducts) {
        if (res.headersSent) {
          console.log('⚠️ Response already sent, skipping checkCompletion');
          return;
        }
        
        console.log(`✅ Order update complete: ${totalProducts} products processed`);
        res.json({ 
          message: 'Order updated successfully with smart FIFO updates',
          productsProcessed: totalProducts
        });
      }
    }
  }
  
  // Функция для обработки увеличения количества продукта
  function processQuantityIncrease(productKod, quantityDiff, callback, orderProductId = null) {
    console.log(`🔄 Processing quantity increase for ${productKod}: +${quantityDiff} (clientId: ${clientId}, orderProductId: ${orderProductId})`);
    console.log(`🔍 processQuantityIncrease called with: productKod=${productKod}, quantityDiff=${quantityDiff}`);
    console.log(`🔍 processQuantityIncrease: starting FIFO consumption...`);
    
    // Проверяем, есть ли у клиента резервация на этот товар
    const checkClientReservation = (afterReservationCallback) => {
      if (!clientId) {
        console.log(`🔍 No clientId, skipping reservation check for ${productKod}`);
        afterReservationCallback(0); // quantityFromReservation = 0
        return;
      }
      
      db.get(`
        SELECT
          SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available_in_reservation
        FROM reservation_products rp
        INNER JOIN reservations r ON rp.reservation_id = r.id
        WHERE rp.product_kod = ?
          AND r.client_id = ?
          AND r.status = 'aktywna'
      `, [productKod, clientId], (err, reservationRow) => {
        if (err) {
          console.error(`❌ Error checking client reservation for ${productKod}:`, err);
          afterReservationCallback(0);
          return;
        }
        
        const availableInReservation = reservationRow?.available_in_reservation || 0;
        const quantityFromReservation = Math.min(availableInReservation, quantityDiff);
        
        console.log(`🔍 Client ${clientId} reservation for ${productKod}: available=${availableInReservation}, will use=${quantityFromReservation}`);
        
        if (quantityFromReservation > 0) {
          // Обновляем ilosc_wydane в резервациях клиента
          db.all(`
            SELECT rp.id, rp.reservation_id, (rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as available
            FROM reservation_products rp
            INNER JOIN reservations r ON rp.reservation_id = r.id
            WHERE rp.product_kod = ?
              AND r.client_id = ?
              AND r.status = 'aktywna'
            ORDER BY r.data_utworzenia ASC
          `, [productKod, clientId], (err, reservationProducts) => {
            if (err) {
              console.error(`❌ Error fetching reservation products for ${productKod}:`, err);
              afterReservationCallback(quantityFromReservation);
              return;
            }
            
            if (reservationProducts.length === 0) {
              console.log(`⚠️ No reservation products found for ${productKod} and client ${clientId}`);
              afterReservationCallback(quantityFromReservation);
              return;
            }
            
            // Распределяем количество по резервациям (FIFO)
            let remainingToFulfill = quantityFromReservation;
            let reservationsUpdated = 0;
            
            reservationProducts.forEach((rp) => {
              if (remainingToFulfill <= 0) {
                reservationsUpdated++;
                if (reservationsUpdated === reservationProducts.length) {
                  afterReservationCallback(quantityFromReservation);
                }
                return;
              }
              
              const toFulfill = Math.min(remainingToFulfill, rp.available);
              
              db.run(
                'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) + ? WHERE id = ?',
                [toFulfill, rp.id],
                function(updateErr) {
                  if (updateErr) {
                    console.error(`❌ Error updating reservation_product ${rp.id}:`, updateErr);
                  } else {
                    console.log(`✅ Updated reservation_product ${rp.id}: ilosc_wydane increased by ${toFulfill}`);
                    
                    // Записываем связь между резервацией и заказом
                    if (orderProductId) {
                      db.run(
                        'INSERT INTO reservation_order_fulfillments (reservation_product_id, order_id, order_product_id, quantity) VALUES (?, ?, ?, ?)',
                        [rp.id, id, orderProductId, toFulfill],
                        (fulfillErr) => {
                          if (fulfillErr) {
                            console.error(`❌ Error creating fulfillment record for reservation_product ${rp.id}:`, fulfillErr);
                          } else {
                            console.log(`✅ Created fulfillment record: reservation_product ${rp.id} -> order ${id}, quantity: ${toFulfill}`);
                          }
                        }
                      );
                    }
                    
                    // Проверяем, полностью ли реализована резервация
                    checkAndUpdateReservationStatus(rp.reservation_id);
                  }
                  
                  reservationsUpdated++;
                  remainingToFulfill -= toFulfill;
                  
                  if (reservationsUpdated === reservationProducts.length) {
                    afterReservationCallback(quantityFromReservation);
                  }
                }
              );
            });
          });
        } else {
          afterReservationCallback(0);
        }
      });
    };
    
    // Проверяем доступность товара с учетом активных резерваций
    console.log(`🔍 processQuantityIncrease: checking availability in working_sheets for ${productKod}`);
    db.get(`
      SELECT 
        ws.ilosc as total_available,
        COALESCE(SUM(CASE 
          WHEN r.status = 'aktywna' 
          THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0)
          ELSE 0 
        END), 0) as reserved,
        COALESCE(SUM(CASE 
          WHEN r.status = 'aktywna' AND r.client_id = ?
          THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0)
          ELSE 0 
        END), 0) as client_reserved
      FROM working_sheets ws
      LEFT JOIN reservation_products rp ON ws.kod = rp.product_kod
      LEFT JOIN reservations r ON rp.reservation_id = r.id
      WHERE ws.kod = ?
      GROUP BY ws.kod, ws.ilosc
    `, [clientId || 0, productKod], (err, row) => {
      if (err) {
        console.error(`❌ Error checking availability for ${productKod}:`, err);
        callback();
        return;
      }
      
      if (!row) {
        console.error(`❌ Product ${productKod} not found in working_sheets`);
        callback();
        return;
      }
      
      // Доступно: общее количество - резервации других клиентов (резервации этого клиента доступны для него)
      const reservedByOthers = row.reserved - (row.client_reserved || 0);
      const availableQuantity = row.total_available - reservedByOthers;
      console.log(`🔍 processQuantityIncrease: available quantity in working_sheets = ${availableQuantity} (total: ${row.total_available}, reserved: ${row.reserved}, client_reserved: ${row.client_reserved})`);
      
      if (availableQuantity < quantityDiff) {
        console.error(`❌ Insufficient quantity for ${productKod}: need ${quantityDiff}, available ${availableQuantity}`);
        callback();
        return;
      }
      
      // Сначала обрабатываем резервации клиента
      checkClientReservation((quantityFromReservation) => {
        // Товар доступен, списываем разницу по FIFO
        console.log(`🎯 FIFO consumption for ${productKod}: ${quantityDiff} szt. (${quantityFromReservation} from reservation)`);
        console.log(`🔍 processQuantityIncrease: calling consumeFromProducts...`);
        consumeFromProducts(productKod, quantityDiff)
          .then(({ consumed, remaining, consumptions }) => {
            console.log(`🎯 FIFO consumption for ${productKod}: ${consumed} szt. consumed`);
            // Записываем списания партий в order_consumptions
            if (consumptions && consumptions.length > 0) {
              const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
              const values = consumptions.flatMap(c => [id, productKod, c.batchId, c.qty, c.cena || 0]);
              db.run(
                `INSERT INTO order_consumptions (order_id, product_kod, batch_id, quantity, batch_price) VALUES ${placeholders}`,
                values,
                (consErr) => {
                  if (consErr) {
                    console.error('❌ Error saving order_consumptions:', consErr);
                  } else {
                    console.log(`✅ Saved ${consumptions.length} consumption rows for order ${id}`);
                  }
                  // Обновляем working_sheets после FIFO списания
                  db.run(
                    'UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?',
                    [quantityDiff, productKod],
                    function(updateErr) {
                      if (updateErr) {
                        console.error(`❌ Error updating working_sheets after FIFO for ${productKod}:`, updateErr);
                      } else {
                        console.log(`✅ Updated working_sheets after FIFO: ${productKod} (quantity reduced by ${quantityDiff})`);
                      }
                      callback();
                    }
                  );
                }
              );
            } else {
              // Обновляем working_sheets даже если нет записей в order_consumptions
              db.run(
                'UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?',
                [quantityDiff, productKod],
                function(updateErr) {
                  if (updateErr) {
                    console.error(`❌ Error updating working_sheets after FIFO for ${productKod}:`, updateErr);
                  } else {
                    console.log(`✅ Updated working_sheets after FIFO: ${productKod} (quantity reduced by ${quantityDiff})`);
                  }
                  callback();
                }
              );
            }
          })
          .catch((fifoError) => {
            console.error(`❌ FIFO consumption error for ${productKod}:`, fifoError);
            callback();
          });
      });
    });
  }
  
  // Функция для обработки уменьшения количества продукта
  function processQuantityDecrease(productKod, quantityDiff, callback) {
    console.log(`🔄 Processing quantity decrease for ${productKod}: -${quantityDiff}`);
    console.log(`🔍 processQuantityDecrease: starting restoration process...`);
    
    // Сначала восстанавливаем ilosc_wydane в резервациях, если они были использованы
    db.all(`
      SELECT rof.*, rp.product_kod, rp.reservation_id
      FROM reservation_order_fulfillments rof
      INNER JOIN reservation_products rp ON rof.reservation_product_id = rp.id
      WHERE rof.order_id = ? AND rp.product_kod = ?
      ORDER BY rof.created_at DESC
    `, [id, productKod], (err, fulfillments) => {
      if (err) {
        console.error(`❌ Error fetching fulfillments for ${productKod}:`, err);
        // Продолжаем даже при ошибке
        proceedWithConsumptions();
        return;
      }
      
      if (fulfillments.length === 0) {
        console.log(`💡 No reservation fulfillments found for ${productKod}`);
        proceedWithConsumptions();
        return;
      }
      
      console.log(`📊 Found ${fulfillments.length} reservation fulfillments for ${productKod}`);
      
      // Восстанавливаем ilosc_wydane в резервациях (LIFO - сначала последние выдачи)
      let remainingToRestoreFromReservation = quantityDiff;
      let fulfillmentsProcessed = 0;
      
      fulfillments.forEach((fulfillment) => {
        if (remainingToRestoreFromReservation <= 0) {
          fulfillmentsProcessed++;
          if (fulfillmentsProcessed === fulfillments.length) {
            proceedWithConsumptions();
          }
          return;
        }
        
        const toRestore = Math.min(remainingToRestoreFromReservation, fulfillment.quantity);
        const newFulfillmentQuantity = fulfillment.quantity - toRestore;
        
        console.log(`🔍 Restoring reservation fulfillment ${fulfillment.id}: quantity=${fulfillment.quantity}, to_restore=${toRestore}, new_quantity=${newFulfillmentQuantity}`);
        
        // Уменьшаем ilosc_wydane в reservation_products
        db.run(
          'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) - ? WHERE id = ?',
          [toRestore, fulfillment.reservation_product_id],
          function(updateErr) {
            if (updateErr) {
              console.error(`❌ Error restoring ilosc_wydane for reservation_product ${fulfillment.reservation_product_id}:`, updateErr);
            } else {
              console.log(`✅ Restored ilosc_wydane for reservation_product ${fulfillment.reservation_product_id}: -${toRestore}`);
              
              // Проверяем и обновляем статус резервации (может вернуться на 'aktywna')
              checkAndUpdateReservationStatus(fulfillment.reservation_id);
            }
            
            // Удаляем или обновляем запись fulfillment
            if (newFulfillmentQuantity <= 0) {
              db.run(
                'DELETE FROM reservation_order_fulfillments WHERE id = ?',
                [fulfillment.id],
                function(deleteErr) {
                  if (deleteErr) {
                    console.error(`❌ Error deleting fulfillment ${fulfillment.id}:`, deleteErr);
                  } else {
                    console.log(`🗑️ Deleted fulfillment ${fulfillment.id}`);
                  }
                  fulfillmentsProcessed++;
                  if (fulfillmentsProcessed === fulfillments.length) {
                    proceedWithConsumptions();
                  }
                }
              );
            } else {
              db.run(
                'UPDATE reservation_order_fulfillments SET quantity = ? WHERE id = ?',
                [newFulfillmentQuantity, fulfillment.id],
                function(updateFulfillErr) {
                  if (updateFulfillErr) {
                    console.error(`❌ Error updating fulfillment ${fulfillment.id}:`, updateFulfillErr);
                  } else {
                    console.log(`✅ Updated fulfillment ${fulfillment.id}: ${fulfillment.quantity} → ${newFulfillmentQuantity}`);
                  }
                  fulfillmentsProcessed++;
                  if (fulfillmentsProcessed === fulfillments.length) {
                    proceedWithConsumptions();
                  }
                }
              );
            }
          }
        );
        
        remainingToRestoreFromReservation -= toRestore;
      });
    });
    
    function proceedWithConsumptions() {
      // Получаем существующие записи в order_consumptions для этого продукта
      // Сортируем по batch_id DESC для LIFO возвратов (сначала новые партии)
      db.all('SELECT * FROM order_consumptions WHERE order_id = ? AND product_kod = ? ORDER BY batch_id DESC', [id, productKod], (err, consumptions) => {
        if (err) {
          console.error(`❌ Error fetching consumptions for ${productKod}:`, err);
          callback();
          return;
        }
        
        if (consumptions.length === 0) {
          console.log(`⚠️ No consumptions found for ${productKod}, restoring only in working_sheets`);
          // Просто восстанавливаем в working_sheets
          db.run(
            'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
            [quantityDiff, productKod],
            function(updateErr) {
              if (updateErr) {
                console.error(`❌ Error updating working_sheets for ${productKod}:`, updateErr);
              } else {
                console.log(`✅ Updated working_sheets: ${productKod} (quantity restored by ${quantityDiff})`);
              }
              callback();
            }
          );
          return;
        }
        
        console.log(`📊 Found ${consumptions.length} consumptions for ${productKod}`);
        console.log(`🔍 Consumptions details:`, JSON.stringify(consumptions, null, 2));
        
        // Восстанавливаем количество в products и уменьшаем/удаляем записи в order_consumptions
        let remainingToRestore = quantityDiff;
        let consumptionsProcessed = 0;
        
        consumptions.forEach((consumption) => {
          if (remainingToRestore <= 0) {
            consumptionsProcessed++;
            checkConsumptionCompletion();
            return;
          }
          
          // Восстанавливаем то количество, которое было списано из этой партии
          const quantityToRestore = Math.min(remainingToRestore, consumption.quantity);
          const newQuantity = consumption.quantity - quantityToRestore;
          
          console.log(`🔍 Restoring from consumption ${consumption.id}: batch_id=${consumption.batch_id}, original_quantity=${consumption.quantity}, to_restore=${quantityToRestore}, new_quantity=${newQuantity}`);
          
          if (newQuantity > 0) {
            // Уменьшаем количество в существующей записи
            db.run(
              'UPDATE order_consumptions SET quantity = ? WHERE id = ?',
              [newQuantity, consumption.id],
              function(updateErr) {
                if (updateErr) {
                  console.error(`❌ Error updating consumption ${consumption.id}:`, updateErr);
                } else {
                  console.log(`✅ Updated consumption ${consumption.id}: ${consumption.quantity} → ${newQuantity}`);
                }
                
                // Восстанавливаем в конкретную партию (batch_id)
                db.run(
                  'UPDATE products SET ilosc_aktualna = ilosc_aktualna + ? WHERE id = ?',
                  [quantityToRestore, consumption.batch_id],
                  function(restoreErr) {
                    if (restoreErr) {
                      console.error(`❌ Error restoring to batch ${consumption.batch_id}:`, restoreErr);
                    } else {
                      console.log(`✅ Restored ${quantityToRestore} to batch ${consumption.batch_id} for ${productKod}`);
                    }
                    consumptionsProcessed++;
                    checkConsumptionCompletion();
                  }
                );
              }
            );
          } else {
            // Удаляем запись, если количество стало 0
            db.run(
              'DELETE FROM order_consumptions WHERE id = ?',
              [consumption.id],
              function(deleteErr) {
                if (deleteErr) {
                  console.error(`❌ Error deleting consumption ${consumption.id}:`, deleteErr);
                } else {
                  console.log(`🗑️ Deleted consumption ${consumption.id} (quantity became 0)`);
                }
                
                // Восстанавливаем в конкретную партию (batch_id)
                db.run(
                  'UPDATE products SET ilosc_aktualna = ilosc_aktualna + ? WHERE id = ?',
                  [quantityToRestore, consumption.batch_id],
                  function(restoreErr) {
                    if (restoreErr) {
                      console.error(`❌ Error restoring to batch ${consumption.batch_id}:`, restoreErr);
                    } else {
                      console.log(`✅ Restored ${quantityToRestore} to batch ${consumption.batch_id} for ${productKod}`);
                    }
                    consumptionsProcessed++;
                    checkConsumptionCompletion();
                  }
                );
              }
            );
          }
          
          remainingToRestore -= quantityToRestore;
        });
        
        function checkConsumptionCompletion() {
          if (consumptionsProcessed === consumptions.length) {
            // Обновляем working_sheets
            db.run(
              'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
              [quantityDiff, productKod],
              function(updateErr) {
                if (updateErr) {
                  console.error(`❌ Error updating working_sheets for ${productKod}:`, updateErr);
                } else {
                  console.log(`✅ Updated working_sheets: ${productKod} (quantity restored by ${quantityDiff})`);
                }
                callback();
              }
            );
          }
        }
      });
    }
  }
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📋 DELETE /api/orders/${id} - Deleting order`);
  
  // Сначала получаем продукты заказа для восстановления количества
  db.all('SELECT * FROM order_products WHERE orderId = ?', [id], (err, orderProducts) => {
    if (err) {
      console.error('❌ Database error fetching order products:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`🔄 Found ${orderProducts.length} products to restore`);
    
    // Получаем записи о списаниях для восстановления в products
    db.all('SELECT * FROM order_consumptions WHERE order_id = ?', [id], (err, consumptions) => {
      if (err) {
        console.error('❌ Database error fetching order consumptions:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      console.log(`🔄 Found ${consumptions.length} consumptions to restore in products`);
      
      // Получаем записи о выдачах из резерваций для восстановления ilosc_wydane (включая reservation_id)
      db.all(`
        SELECT rof.*, rp.reservation_id
        FROM reservation_order_fulfillments rof
        INNER JOIN reservation_products rp ON rof.reservation_product_id = rp.id
        WHERE rof.order_id = ?
      `, [id], (err, fulfillments) => {
        if (err) {
          console.error('❌ Database error fetching reservation fulfillments:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`🔄 Found ${fulfillments.length} reservation fulfillments to restore`);
        
        // 0. Восстанавливаем ilosc_wydane в reservation_products
        let fulfillmentsRestored = 0;
        const totalFulfillments = fulfillments.length;
        
        const proceedAfterFulfillmentsRestore = () => {
          // 1. Восстанавливаем количество в products для каждой партии
          let consumptionsRestored = 0;
          const totalConsumptions = consumptions.length;
          
          const proceedAfterProductsRestore = () => {
            // 2. Удаляем записи о выдачах из резерваций
            db.run('DELETE FROM reservation_order_fulfillments WHERE order_id = ?', [id], function(deleteFulfillmentsErr) {
              if (deleteFulfillmentsErr) {
                console.error('❌ Database error deleting reservation fulfillments:', deleteFulfillmentsErr);
                // Продолжаем даже при ошибке, так как CASCADE должен удалить их автоматически
              } else {
                console.log(`🗑️ Reservation fulfillments deleted for order ${id}`);
              }
              
              // 3. Удаляем записи о списаниях
              db.run('DELETE FROM order_consumptions WHERE order_id = ?', [id], function(deleteConsumptionsErr) {
                if (deleteConsumptionsErr) {
                  console.error('❌ Database error deleting order consumptions:', deleteConsumptionsErr);
                  res.status(500).json({ error: deleteConsumptionsErr.message });
                  return;
                }
                
                console.log(`🗑️ Order consumptions deleted for order ${id}`);
                
                // 4. Удаляем продукты заказа
                db.run('DELETE FROM order_products WHERE orderId = ?', [id], function(deleteProductsErr) {
                  if (deleteProductsErr) {
                    console.error('❌ Database error deleting order products:', deleteProductsErr);
                    res.status(500).json({ error: deleteProductsErr.message });
                    return;
                  }
                  
                  console.log(`🗑️ Order products deleted for order ${id}`);
                  
                  // 5. Удаляем заказ
                  db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
                    if (err) {
                      console.error('❌ Database error deleting order:', err);
                      res.status(500).json({ error: err.message });
                      return;
                    }
                    
                    console.log(`✅ Order ${id} deleted successfully`);
                    
                    // 6. Восстанавливаем количество в working_sheets
                    let restoredCount = 0;
                    let totalProducts = orderProducts.length;
                    
                    if (totalProducts === 0) {
                      console.log('💡 No products to restore in working_sheets');
                      res.json({ 
                        message: 'Order deleted successfully',
                        workingSheetsRestored: 0,
                        productsRestored: consumptionsRestored,
                        reservationFulfillmentsRestored: fulfillmentsRestored
                      });
                      return;
                    }
                    
                    orderProducts.forEach((product) => {
                      db.run(
                        'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
                        [product.ilosc, product.kod],
                        function(restoreErr) {
                          restoredCount++;
                          if (restoreErr) {
                            console.error(`❌ Error restoring quantity in working_sheets for product ${product.kod}:`, restoreErr);
                          } else {
                            console.log(`✅ Restored quantity in working_sheets for product ${product.kod}: +${product.ilosc}`);
                          }
                          
                          if (restoredCount === totalProducts) {
                            console.log(`📊 Working sheets restored: ${restoredCount}/${totalProducts} products`);
                            res.json({ 
                              message: 'Order deleted successfully',
                              workingSheetsRestored: restoredCount,
                              productsRestored: consumptionsRestored,
                              reservationFulfillmentsRestored: fulfillmentsRestored
                            });
                          }
                        }
                      );
                    });
                  });
                });
              });
            });
          };
          
          // Восстанавливаем каждую партию в products
          if (totalConsumptions === 0) {
            console.log('💡 No consumptions to restore in products');
            proceedAfterProductsRestore();
          } else {
            consumptions.forEach((consumption) => {
              db.run(
                'UPDATE products SET ilosc_aktualna = ilosc_aktualna + ? WHERE id = ?',
                [consumption.quantity, consumption.batch_id],
                function(restoreErr) {
                  consumptionsRestored++;
                  if (restoreErr) {
                    console.error(`❌ Error restoring quantity in products for batch ${consumption.batch_id}:`, restoreErr);
                  } else {
                    console.log(`✅ Restored ${consumption.quantity} units to batch ${consumption.batch_id} (product: ${consumption.product_kod})`);
                  }
                  
                  if (consumptionsRestored === totalConsumptions) {
                    console.log(`📊 Products restored: ${consumptionsRestored}/${totalConsumptions} batches`);
                    proceedAfterProductsRestore();
                  }
                }
              );
            });
          }
        };
        
        // Восстанавливаем ilosc_wydane для каждой записи fulfillment
        if (totalFulfillments === 0) {
          console.log('💡 No reservation fulfillments to restore');
          proceedAfterFulfillmentsRestore();
        } else {
          // Собираем уникальные reservation_id для проверки статуса после восстановления
          const reservationIdsToCheck = [...new Set(fulfillments.map(f => f.reservation_id))];
          
          fulfillments.forEach((fulfillment) => {
            db.run(
              'UPDATE reservation_products SET ilosc_wydane = COALESCE(ilosc_wydane, 0) - ? WHERE id = ?',
              [fulfillment.quantity, fulfillment.reservation_product_id],
              function(restoreErr) {
                fulfillmentsRestored++;
                if (restoreErr) {
                  console.error(`❌ Error restoring ilosc_wydane for reservation_product ${fulfillment.reservation_product_id}:`, restoreErr);
                } else {
                  console.log(`✅ Restored ilosc_wydane for reservation_product ${fulfillment.reservation_product_id}: -${fulfillment.quantity}`);
                }
                
                if (fulfillmentsRestored === totalFulfillments) {
                  console.log(`📊 Reservation fulfillments restored: ${fulfillmentsRestored}/${totalFulfillments}`);
                  
                  // Проверяем и обновляем статус каждой затронутой резервации
                  reservationIdsToCheck.forEach(reservationId => {
                    checkAndUpdateReservationStatus(reservationId);
                  });
                  
                  proceedAfterFulfillmentsRestore();
                }
              }
            );
          });
        }
      });
    });
  });
});

// Order Consumptions API
app.get('/api/order-consumptions', (req, res) => {
  console.log('📊 GET /api/order-consumptions - Fetching all order consumptions');
  
  const query = `
    SELECT 
      oc.*,
      o.numer_zamowienia,
      o.klient,
      p.nazwa as product_name,
      p.cena as batch_price
    FROM order_consumptions oc
    LEFT JOIN orders o ON oc.order_id = o.id
    LEFT JOIN products p ON oc.batch_id = p.id
    ORDER BY oc.created_at DESC
  `;
  
  db.all(query, (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${rows.length} consumption records`);
    res.json(rows);
  });
});

app.get('/api/order-consumptions/search', (req, res) => {
  const { product_kod, order_id } = req.query;
  console.log(`🔍 GET /api/order-consumptions/search - Searching consumptions:`, { product_kod, order_id });
  
  let query = `
    SELECT 
      oc.*,
      o.numer_zamowienia,
      o.klient,
      p.nazwa as product_name,
      p.cena as batch_price
    FROM order_consumptions oc
    LEFT JOIN orders o ON oc.order_id = o.id
    LEFT JOIN products p ON oc.batch_id = p.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (product_kod) {
    query += ' AND oc.product_kod = ?';
    params.push(product_kod);
  }
  
  if (order_id) {
    query += ' AND oc.order_id = ?';
    params.push(order_id);
  }
  
  query += ' ORDER BY oc.created_at DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${rows.length} consumption records`);
    res.json(rows);
  });
});

// Order Products API
app.get('/api/orders-with-products', (req, res) => {
  console.log('📋 GET /api/orders-with-products - Fetching orders with products');
  
  // Сначала получаем все заказы
  db.all('SELECT * FROM orders ORDER BY data_utworzenia DESC', (err, orders) => {
    if (err) {
      console.error('❌ Database error fetching orders:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`✅ Found ${orders.length} orders`);
    
    if (orders.length === 0) {
      res.json([]);
      return;
    }
    
    // Для каждого заказа получаем продукты
    let processedOrders = 0;
    const result = [];
    
    orders.forEach((order) => {
      db.all('SELECT * FROM order_products WHERE orderId = ?', [order.id], (err, products) => {
        if (err) {
          console.error(`❌ Database error fetching products for order ${order.id}:`, err);
        } else {
          console.log(`✅ Found ${products.length} products for order ${order.id}`);
        }
        
        // Проверяем, есть ли фактура по этому заказу
        db.get('SELECT numer_faktury FROM invoices WHERE order_id = ? LIMIT 1', [order.id], (errInv, invRow) => {
          if (errInv) console.error(`❌ Error fetching invoice for order ${order.id}:`, errInv);
          const orderWithProducts = {
            id: order.id,
            klient: order.klient,
            numer_zamowienia: order.numer_zamowienia,
            data_utworzenia: order.data_utworzenia,
            laczna_ilosc: order.laczna_ilosc,
            typ: order.typ || 'zamowienie',
            numer_zwrotu: order.numer_zwrotu || null,
            numer_faktury: (errInv || !invRow) ? null : invRow.numer_faktury,
            products: products || []
          };
          
          result.push(orderWithProducts);
          processedOrders++;
          
          if (processedOrders === orders.length) {
            console.log(`✅ Sending ${result.length} orders with grouped products`);
            res.json(result);
          }
        });
      });
    });
  });
});

app.post('/api/order-products', (req, res) => {
  const { orderId, kod, nazwa, ilosc, typ } = req.body;
  console.log('📋 POST /api/order-products - Adding product to order:', { orderId, kod, nazwa, ilosc });
  
  if (!orderId || !kod || !nazwa || !ilosc) {
    console.log('❌ Validation failed: orderId, kod, nazwa, and ilosc are required');
    return res.status(400).json({ error: 'Order ID, kod, nazwa, and ilosc are required' });
  }
  
  db.run(
    'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?)',
    [orderId, kod, nazwa, ilosc, typ || 'sprzedaz'],
    function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Order product added with ID: ${this.lastID}`);
      res.json({ id: this.lastID, message: 'Order product added successfully' });
    }
  );
});

// Clients API
app.get('/api/clients', (req, res) => {
  console.log('👥 GET /api/clients - Fetching all clients');
  db.all('SELECT * FROM clients ORDER BY nazwa', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`✅ Found ${rows.length} clients`);
    res.json(rows || []);
  });
});

app.get('/api/clients/search', (req, res) => {
  const { q } = req.query;
  console.log(`🔍 GET /api/clients/search - Searching clients with query: "${q}"`);
  
  if (!q) {
    console.log('❌ Validation failed: query parameter is required');
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  db.all(
    'SELECT * FROM clients WHERE nazwa LIKE ? OR firma LIKE ? ORDER BY nazwa LIMIT 10',
    [`%${q}%`, `%${q}%`],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found ${rows.length} clients matching "${q}"`);
      res.json(rows || []);
    }
  );
});

app.get('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  console.log(`👥 GET /api/clients/${id} - Fetching client by ID`);
  
  db.get('SELECT * FROM clients WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      console.log(`❌ Client with ID ${id} not found`);
      return res.status(404).json({ error: 'Client not found' });
    }
    console.log(`✅ Found client: ${row.nazwa}`);
    res.json(row);
  });
});

app.post('/api/clients', (req, res) => {
  const { nazwa, firma, adres, kontakt, czasDostawy, czas_dostawy } = req.body;
  // Поддерживаем оба варианта названия поля
  const czasDostawyValue = czasDostawy || czas_dostawy;
  
  console.log('👥 POST /api/clients - Creating new client:', { nazwa, firma, czasDostawy: czasDostawyValue });
  
  if (!nazwa) {
    console.log('❌ Validation failed: nazwa is required');
    return res.status(400).json({ error: 'Nazwa is required' });
  }
  
  db.run(
    'INSERT INTO clients (nazwa, firma, adres, kontakt, czas_dostawy) VALUES (?, ?, ?, ?, ?)',
    [nazwa, firma, adres, kontakt, czasDostawyValue],
    function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Client created with ID: ${this.lastID}`);
      res.json({ id: this.lastID, message: 'Client added successfully' });
    }
  );
});

app.put('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  const { nazwa, firma, adres, kontakt, czas_dostawy } = req.body;
  console.log(`👥 PUT /api/clients/${id} - Updating client:`, { nazwa, firma });
  
  // Сначала получаем старое значение nazwa клиента
  db.get('SELECT nazwa FROM clients WHERE id = ?', [id], (err, oldClient) => {
    if (err) {
      console.error('❌ Database error getting old client:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!oldClient) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    
    // Обновляем клиента
  db.run(
    'UPDATE clients SET nazwa = ?, firma = ?, adres = ?, kontakt = ?, czas_dostawy = ? WHERE id = ?',
    [nazwa, firma, adres, kontakt, czas_dostawy, id],
    function(err) {
      if (err) {
          console.error('❌ Database error updating client:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Client ${id} updated successfully`);
      res.json({ message: 'Client updated successfully' });
    }
  );
  });
});

app.delete('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  console.log(`👥 DELETE /api/clients/${id} - Deleting client`);
  
  db.run('DELETE FROM clients WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`✅ Client ${id} deleted successfully`);
    res.json({ message: 'Client deleted successfully' });
  });
});

// Product Receipts API
app.get('/api/product-receipts', (req, res) => {
  console.log('📦 GET /api/product-receipts - Fetching all product receipts');
  db.all('SELECT * FROM product_receipts ORDER BY dataPrzyjecia DESC', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Обрабатываем JSON данные
    const processedRows = rows.map(row => ({
      ...row,
      products: row.products ? JSON.parse(row.products) : []
    }));
    
    console.log(`✅ Found ${processedRows.length} product receipts`);
    res.json(processedRows || []);
  });
});

app.get('/api/product-receipts/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📦 GET /api/product-receipts/${id} - Fetching product receipt by ID`);
  
  db.get('SELECT * FROM product_receipts WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      console.log(`❌ Product receipt with ID ${id} not found`);
      return res.status(404).json({ error: 'Product receipt not found' });
    }
    
    // Обрабатываем JSON данные
    const processedRow = {
      ...row,
      products: row.products ? JSON.parse(row.products) : []
    };
    
    console.log(`✅ Found product receipt: ${processedRow.dataPrzyjecia} (${processedRow.products.length} products)`);
    res.json(processedRow);
  });
});

app.post('/api/product-receipts', upload.fields([
  { name: 'productInvoice', maxCount: 1 },
  { name: 'transportInvoice', maxCount: 1 }
]), (req, res) => {
  console.log('📦 POST /api/product-receipts - Request received');
  console.log('📦 Request body:', req.body);
  console.log('📦 Request files:', req.files);
  console.log('📦 Request headers:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length']
  });
  console.log('📦 Files check:', {
    hasFiles: !!req.files,
    hasProductInvoice: !!(req.files && req.files.productInvoice),
    hasTransportInvoice: !!(req.files && req.files.transportInvoice),
    productInvoiceFile: req.files?.productInvoice,
    transportInvoiceFile: req.files?.transportInvoice,
    filesCount: req.files ? Object.keys(req.files).length : 0
  });
  
  let date, sprzedawca, wartosc, kosztDostawy, products, productInvoice, transportInvoice, aktualnyKurs, podatekAkcyzowy, rabat;
  
  // Проверяем, есть ли файлы (FormData) или это JSON
  if (req.files && (req.files.productInvoice || req.files.transportInvoice)) {
    console.log('📎 Processing FormData request');
    try {
      const jsonData = JSON.parse(req.body.data);
      date = jsonData.date;
      sprzedawca = jsonData.sprzedawca;
      wartosc = jsonData.wartosc;
      kosztDostawy = jsonData.kosztDostawy;
      products = jsonData.products;
      aktualnyKurs = jsonData.aktualnyKurs;
      podatekAkcyzowy = jsonData.podatekAkcyzowy;
      rabat = jsonData.rabat;
      productInvoice = req.files.productInvoice ? req.files.productInvoice[0].filename : null;
      transportInvoice = req.files.transportInvoice ? req.files.transportInvoice[0].filename : null;
      console.log('📎 Files processed:', { productInvoice, transportInvoice });
    } catch (error) {
      console.error('❌ Error parsing JSON data from FormData:', error);
      return res.status(400).json({ error: 'Invalid JSON data in FormData' });
    }
  } else {
    console.log('📄 Processing JSON request');
    date = req.body.date;
    sprzedawca = req.body.sprzedawca;
    wartosc = req.body.wartosc;
    kosztDostawy = req.body.kosztDostawy;
    products = req.body.products;
    aktualnyKurs = req.body.aktualnyKurs;
    podatekAkcyzowy = req.body.podatekAkcyzowy;
    rabat = req.body.rabat;
    productInvoice = req.body.productInvoice;
    transportInvoice = req.body.transportInvoice;
  }
  
  // Парсим kosztDostawy с заменой запятой на точку
  kosztDostawy = parseFloat(String(kosztDostawy || '0').replace(',', '.')) || 0;
  
  console.log('📦 POST /api/product-receipts - Creating new product receipt:', { 
    date, 
    sprzedawca, 
    wartosc, 
    productsCount: products?.length || 0,
    aktualnyKurs,
    podatekAkcyzowy
  });
  
  if (!date || !products || !Array.isArray(products)) {
    console.log('❌ Validation failed: date and products array are required');
    return res.status(400).json({ error: 'Date and products array are required' });
  }
  
  console.log(`🔄 Processing ${products.length} products for receipt`);
  
  // Разрешаем дубликаты продуктов в одной приёмке
  
  // Вычисляем общее количество бутылок для расчета стоимости доставки на единицу
  // Исключаем aksesoria из расчета транспорта
  const totalBottles = products.reduce((total, product) => {
    if (product.typ === 'aksesoria') return total;
    return total + (product.ilosc || 0);
  }, 0);
  const kurs = aktualnyKurs || 1;
  const kosztDostawyPerUnit = totalBottles > 0 ? Math.round((((kosztDostawy || 0) / totalBottles) * kurs) * 100) / 100 : 0;
  
  console.log(`💰 Delivery cost calculation: ${kosztDostawy || 0}€ / ${totalBottles} bottles * ${kurs} kurs = ${kosztDostawyPerUnit.toFixed(4)} zł per unit`);
  console.log(`📊 Podatek akcyzowy input: ${podatekAkcyzowy}`);
  console.log(`📊 Aktualny kurs input: ${aktualnyKurs}`);
  
  db.run(
    'INSERT INTO product_receipts (dataPrzyjecia, sprzedawca, wartosc, kosztDostawy, aktualny_kurs, podatek_akcyzowy, rabat, products, productInvoice, transportInvoice) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [date, sprzedawca || '', wartosc || 0, kosztDostawy || 0, kurs, (parseFloat(String(podatekAkcyzowy||'').replace(',', '.'))||0), (parseFloat(String(rabat||'').replace(',', '.'))||0), JSON.stringify(products), productInvoice || null, transportInvoice || null],
    function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      const receiptId = this.lastID;
      console.log('✅ Product receipt saved with ID:', receiptId);
      
      // Автоматически добавляем товары в working_sheets
      let processedCount = 0;
      let productsInserted = 0;
      let workingSheetsUpdated = 0;
      let workingSheetsInserted = 0;
      

      
            // Функция для последовательной обработки товаров при создании
      const processProductsSequentially = async () => {
        const startTime = Date.now();
        console.log(`⏱️ Starting product processing at ${new Date().toISOString()}`);
        
        // Начинаем транзакцию для обеспечения консистентности
        await new Promise((resolve, reject) => {
          db.run('BEGIN TRANSACTION', (err) => {
            if (err) {
              console.error('❌ Error starting transaction:', err);
              reject(err);
            } else {
              console.log('🔄 Transaction started');
              resolve();
            }
          });
        });

        try {
          // Группируем товары по коду для суммирования количества
          const productsByCode = {};
          for (const product of products) {
            if (!productsByCode[product.kod]) {
              productsByCode[product.kod] = [];
            }
            productsByCode[product.kod].push(product);
          }
          
          console.log(`📊 Unique product codes: ${Object.keys(productsByCode).length}, total products: ${products.length}`);
          
          // Обрабатываем каждый уникальный код
          for (const [productCode, productsList] of Object.entries(productsByCode)) {
            console.log(`📝 Processing product code: ${productCode} (${productsList.length} items)`);
            
            // Создаем записи в products для каждого товара (даже с одинаковым кодом)
            for (const product of productsList) {
              console.log(`➕ Creating new product record: ${product.kod} (ilosc: ${product.ilosc})`);
            await new Promise((resolve, reject) => {
              db.run(
                  'INSERT INTO products (kod, nazwa, kod_kreskowy, cena, ilosc, ilosc_aktualna, receipt_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                  product.kod, 
                  product.nazwa, 
                  product.kod_kreskowy || null, 
                  product.cena || 0,
                  product.ilosc,
                  product.ilosc, // ilosc_aktualna
                    receiptId,
                    (product.cena || 0) === 0 ? 'samples' : null
                ],
                function(err) {
                  if (err) {
                    console.error('❌ Error inserting into products:', err);
                    reject(err);
                                      } else {
                      console.log(`✅ Created new product record: ${product.kod} with ID: ${this.lastID}`);
                      productsInserted++;
                      resolve();
                    }
                  }
                );
              });
            }
            
            // Суммируем количество и находим максимальную цену среди всех товаров с таким кодом
            const summedQuantity = productsList.reduce((sum, p) => sum + (p.ilosc || 0), 0);
            const maxCenaRaw = Math.max(...productsList.map(p => parseFloat(p.cena || 0)));
            const maxCena = isNaN(maxCenaRaw) ? 0 : maxCenaRaw;
            const mainProduct = productsList[0]; // Берем первый товар как основной (для остальных данных)
            
            console.log(`📊 Product ${productCode}: ${productsList.length} items, total quantity: ${summedQuantity}, max price: ${maxCena}`);
            
            // Обновляем working_sheets
            console.log(`📝 Processing working_sheets for: ${productCode}`);
            await new Promise((resolve, reject) => {
              db.get('SELECT * FROM working_sheets WHERE kod = ?', [productCode], (err, existingProduct) => {
                if (err) {
                  console.error('❌ Error checking working_sheets:', err);
                  reject(err);
                  return;
                }
                
                if (existingProduct) {
                  // Если товар существует - сохраняем снимок ДО изменений, затем обновляем
                  console.log(`📝 Updating existing product: ${productCode}`);
                  
                  const oldPrice = existingProduct.cena || 0;
                  const newPrice = maxCena;
                  
                  console.log(`💰 Price for ${productCode}: oldPrice=${oldPrice}, newPrice=${newPrice} (max from all items)`);
                  
                  // 1. Сначала сохраняем снимок ДО изменений в working_sheets_history
                  console.log(`📸 Saving snapshot BEFORE changes for ${productCode}`);
                  db.run(
                    `INSERT INTO working_sheets_history 
                     (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny, action, receipt_id)
                     SELECT kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny,
                            'before_receipt', ?
                     FROM working_sheets WHERE kod = ?`,
                    [receiptId, productCode],
                    function(err) {
                      if (err) {
                        console.error(`❌ Error saving snapshot for ${productCode}:`, err);
                        reject(err);
                        return;
                      }
                      console.log(`✅ Snapshot saved for ${productCode} (receipt_id: ${receiptId})`);
                      
                      // 2. Затем обновляем working_sheets
                      console.log(`📝 Updating working_sheets for ${productCode}`);
                      
                      const cenaValue = parseFloat(newPrice) || 0;
                      const objetoscValue = parseFloat(String(mainProduct.objetosc || '1').replace(',', '.')) || 1;
                      const podatekAkcyzowyValue = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                      
                      // Для bezalkoholowe, ferment и aksesoria податок всегда 0
                      const isBezalkoholoweOrFermentOrAksesoriaUpd = mainProduct.typ === 'bezalkoholowe' || mainProduct.typ === 'ferment' || mainProduct.typ === 'aksesoria';
                      console.log(`🔍 UPDATE type check for ${productCode}: typ="${mainProduct.typ}", isBezalkoholoweOrFermentOrAksesoriaUpd=${isBezalkoholoweOrFermentOrAksesoriaUpd}`);
                      const podatekValueUpd = isBezalkoholoweOrFermentOrAksesoriaUpd ? 0 :
                        (podatekAkcyzowyValue === 0 ? 0 : Math.round((podatekAkcyzowyValue * objetoscValue) * 100) / 100);
                      // Для aksesoria транспорт не распределяется
                      const kosztDostawyPerUnitForProduct = mainProduct.typ === 'aksesoria' ? 0 : kosztDostawyPerUnit;
                      const kosztWlasnyValueUpd = parseFloat((cenaValue * kurs + kosztDostawyPerUnitForProduct + podatekValueUpd).toFixed(2));
                      
                      console.log(`📊 UPDATE ${productCode}:`);
                      console.log(`  - newPrice: ${newPrice} → ${cenaValue}`);
                      console.log(`  - objetosc: ${mainProduct.objetosc} → ${objetoscValue}`);
                      console.log(`  - podatekAkcyzowy: ${podatekAkcyzowy} → ${podatekAkcyzowyValue}`);
                      console.log(`  - kosztDostawyPerUnit: ${kosztDostawyPerUnit}`);
                      console.log(`  - podatekValueUpd: ${podatekValueUpd} (forced to 0: ${isBezalkoholoweOrFermentOrAksesoriaUpd})`);
                      console.log(`  - kosztWlasnyValueUpd: ${kosztWlasnyValueUpd}`);
                      
                    db.run(
                      `UPDATE working_sheets SET 
                        ilosc = ilosc + ?, 
                          nazwa = ?,
                          kod_kreskowy = ?,
                          typ = ?,
                          sprzedawca = ?,
                          cena = ?,
                          data_waznosci = ?,
                          objetosc = ?,
                          koszt_dostawy_per_unit = ?,
                          podatek_akcyzowy = ?,
                          koszt_wlasny = ?
                      WHERE kod = ?`,
                        [
                          summedQuantity, 
                          mainProduct.nazwa,
                          mainProduct.kod_kreskowy || null,
                          mainProduct.typ || null,
                          sprzedawca || null,
                          cenaValue,
                          mainProduct.dataWaznosci || null,
                          mainProduct.objetosc || null,
                          kosztDostawyPerUnitForProduct || 0,
                          podatekValueUpd || 0,
                          kosztWlasnyValueUpd || 0,
                          productCode
                        ],
                      function(err) {
                        if (err) {
                          console.error('❌ Error updating working_sheets:', err);
                          reject(err);
                        } else {
                        console.log(`✅ Updated working_sheets: ${productCode}`);
                          workingSheetsUpdated++;
                          resolve();
                        }
                      }
                    );
                    }); // Закрываем функцию сохранения снимка
                  } else {
                  // Если товара нет - создаем новую запись в working_sheets
                  console.log(`➕ Creating new product: ${productCode}`);
                  const cenaValue = maxCena;
                  const objetoscValue = parseFloat(String(mainProduct.objetosc || '1').replace(',', '.')) || 1;
                  const podatekAkcyzowyValue = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                  
                  // Для bezalkoholowe, ferment и aksesoria податок всегда 0
                  const isBezalkoholoweOrFermentOrAksesoria = mainProduct.typ === 'bezalkoholowe' || mainProduct.typ === 'ferment' || mainProduct.typ === 'aksesoria';
                  console.log(`🔍 Product type check for ${productCode}: typ="${mainProduct.typ}", isBezalkoholoweOrFermentOrAksesoria=${isBezalkoholoweOrFermentOrAksesoria}`);
                  const podatekValue = isBezalkoholoweOrFermentOrAksesoria ? 0 : 
                    (podatekAkcyzowyValue === 0 ? 0 : Math.round((podatekAkcyzowyValue * objetoscValue) * 100) / 100);
                  // Для aksesoria транспорт не распределяется
                  const kosztDostawyPerUnitForProduct = mainProduct.typ === 'aksesoria' ? 0 : kosztDostawyPerUnit;
                  const kosztWlasnyValue = parseFloat((cenaValue * kurs + kosztDostawyPerUnitForProduct + podatekValue).toFixed(2));
                  console.log(`💰 Final podatekValue for ${productCode}: ${podatekValue} (forced to 0: ${isBezalkoholoweOrFermentOrAksesoria})`);
                  
                  console.log(`📊 Product ${productCode}:`);
                  console.log(`  - cena: ${mainProduct.cena} → ${cenaValue}`);
                  console.log(`  - objetosc: ${mainProduct.objetosc} → ${objetoscValue}`);
                  console.log(`  - podatekAkcyzowy: ${podatekAkcyzowy} → ${podatekAkcyzowyValue}`);
                  console.log(`  - kurs: ${kurs}`);
                  console.log(`  - kosztDostawyPerUnit: ${kosztDostawyPerUnit}`);
                  console.log(`  - podatekValue: ${podatekValue}`);
                  console.log(`  - kosztWlasnyValue: ${kosztWlasnyValue}`);
                  
                  const finalKosztDostawy = kosztDostawyPerUnitForProduct || 0;
                  const finalPodatek = podatekValue || 0;
                  const finalKosztWlasny = kosztWlasnyValue || 0;
                  
                  console.log(`🔍 FINAL VALUES for SQL INSERT:`);
                  console.log(`  - koszt_dostawy_per_unit: ${finalKosztDostawy} (type: ${typeof finalKosztDostawy})`);
                  console.log(`  - podatek_akcyzowy: ${finalPodatek} (type: ${typeof finalPodatek})`);
                  console.log(`  - koszt_wlasny: ${finalKosztWlasny} (type: ${typeof finalKosztWlasny})`);
                  
                  db.run(
                    'INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                      productCode, 
                      mainProduct.nazwa, 
                      summedQuantity, 
                      mainProduct.kod_kreskowy || null, 
                      mainProduct.typ || null, 
                      sprzedawca || null, 
                      cenaValue,
                      mainProduct.dataWaznosci || null,
                      mainProduct.objetosc || null,
                      finalKosztDostawy,
                      finalPodatek,
                      finalKosztWlasny
                    ],
                    function(err) {
                      if (err) {
                        console.error('❌ Error inserting into working_sheets:', err);
                        reject(err);
                      } else {
                        console.log(`✅ Created new working_sheets record: ${productCode}`);
                        workingSheetsInserted++;
                        
                        resolve();
                      }
                    }
                  );
                }
              });
            });
            
            processedCount++;
          }
          
          // Коммитим транзакцию
          await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
              if (err) {
                console.error('❌ Error committing transaction:', err);
                reject(err);
              } else {
                console.log('✅ Transaction committed successfully');
                resolve();
              }
            });
          });
          
          // Отправляем ответ
          const endTime = Date.now();
          const processingTime = endTime - startTime;
          console.log(`🎉 Processing complete in ${processingTime}ms: ${workingSheetsUpdated} working_sheets updated, ${workingSheetsInserted} working_sheets inserted, ${productsInserted} products created`);
          res.json({ 
            id: receiptId, 
            message: 'Product receipt added successfully',
            workingSheetsUpdated: workingSheetsUpdated,
            workingSheetsInserted: workingSheetsInserted,
            productsCreated: productsInserted,
            processingTime: processingTime
          });
          
        } catch (error) {
          console.error('❌ Error during product processing:', error);
          
          // Откатываем транзакцию
          try {
            await new Promise((resolve, reject) => {
              db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) {
                  console.error('❌ Error rolling back transaction:', rollbackErr);
                  reject(rollbackErr);
                } else {
                  console.log('🔄 Transaction rolled back');
                  resolve();
                }
              });
            });
          } catch (rollbackError) {
            console.error('❌ Failed to rollback transaction:', rollbackError);
          }
          
          // Если ответ ещё не отправлен, отправляем ошибку
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to process products: ' + error.message });
          }
        }
      };
      
      // Запускаем последовательную обработку
      processProductsSequentially();
    }
  );
});

app.put('/api/product-receipts/:id', upload.fields([
  { name: 'productInvoice', maxCount: 1 },
  { name: 'transportInvoice', maxCount: 1 }
]), (req, res) => {
  const { id } = req.params;
  console.log(`📦 PUT /api/product-receipts/${id} - Request received`);
  console.log('📦 Request body:', req.body);
  console.log('📦 Request files:', req.files);
  console.log('📦 Files check (PUT):', {
    hasFiles: !!req.files,
    hasProductInvoice: !!(req.files && req.files.productInvoice),
    hasTransportInvoice: !!(req.files && req.files.transportInvoice),
    productInvoiceFile: req.files?.productInvoice,
    transportInvoiceFile: req.files?.transportInvoice
  });
  
  let date, sprzedawca, wartosc, kosztDostawy, products, productInvoice, transportInvoice, aktualnyKurs, podatekAkcyzowy, rabat;
  
  // Проверяем, есть ли файлы (FormData) или это JSON
  if (req.files && (req.files.productInvoice || req.files.transportInvoice)) {
    console.log('📎 Processing FormData request (PUT)');
    try {
      const jsonData = JSON.parse(req.body.data);
      date = jsonData.date;
      sprzedawca = jsonData.sprzedawca;
      wartosc = jsonData.wartosc;
      kosztDostawy = jsonData.kosztDostawy;
      products = jsonData.products;
      aktualnyKurs = jsonData.aktualnyKurs;
      podatekAkcyzowy = jsonData.podatekAkcyzowy;
      rabat = jsonData.rabat;
      productInvoice = req.files.productInvoice ? req.files.productInvoice[0].filename : null;
      transportInvoice = req.files.transportInvoice ? req.files.transportInvoice[0].filename : null;
      console.log('📎 Files processed (PUT):', { productInvoice, transportInvoice });
    } catch (error) {
      console.error('❌ Error parsing JSON data from FormData:', error);
      return res.status(400).json({ error: 'Invalid JSON data in FormData' });
    }
  } else {
    console.log('📄 Processing JSON request (PUT)');
    date = req.body.date;
    sprzedawca = req.body.sprzedawca;
    wartosc = req.body.wartosc;
    kosztDostawy = req.body.kosztDostawy;
    products = req.body.products;
    aktualnyKurs = req.body.aktualnyKurs;
    podatekAkcyzowy = req.body.podatekAkcyzowy;
    rabat = req.body.rabat;
    productInvoice = req.body.productInvoice;
    transportInvoice = req.body.transportInvoice;
  }
  
  // Парсим kosztDostawy с заменой запятой на точку
  kosztDostawy = parseFloat(String(kosztDostawy || '0').replace(',', '.')) || 0;
  
  console.log(`📦 PUT /api/product-receipts/${id} - Updating product receipt:`, { 
    date, 
    sprzedawca, 
    wartosc, 
    productsCount: products?.length || 0 
  });
  
  if (!date || !products || !Array.isArray(products)) {
    console.log('❌ Validation failed: date and products array are required');
    return res.status(400).json({ error: 'Date and products array are required' });
  }
  
  // Сначала получаем старые данные для сравнения
  db.get('SELECT products, productInvoice, transportInvoice, podatek_akcyzowy, aktualny_kurs, kosztDostawy FROM product_receipts WHERE id = ?', [id], (err, oldReceipt) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!oldReceipt) {
      console.log(`❌ Product receipt with ID ${id} not found`);
      return res.status(404).json({ error: 'Product receipt not found' });
    }
    
    const oldProducts = JSON.parse(oldReceipt.products || '[]');
    const oldPodatekAkcyzowy = parseFloat(String(oldReceipt.podatek_akcyzowy || '0').replace(',', '.')) || 0;
    const newPodatekAkcyzowy = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.')) || 0;
    const podatekAkcyzowyChanged = Math.abs(oldPodatekAkcyzowy - newPodatekAkcyzowy) > 0.01;
    
    const oldKurs = parseFloat(oldReceipt.aktualny_kurs || '1') || 1;
    const newKurs = parseFloat(aktualnyKurs || '1') || 1;
    const kursChanged = Math.abs(oldKurs - newKurs) > 0.01;
    
    const oldKosztDostawy = parseFloat(oldReceipt.kosztDostawy || '0') || 0;
    const newKosztDostawy = parseFloat(kosztDostawy || '0') || 0;
    const kosztDostawyChanged = Math.abs(oldKosztDostawy - newKosztDostawy) > 0.01;
    
    console.log(`🔄 Found ${oldProducts.length} old products, updating to ${products.length} new products`);
    console.log(`📊 Podatek akcyzowy: old=${oldPodatekAkcyzowy}, new=${newPodatekAkcyzowy}, changed=${podatekAkcyzowyChanged}`);
    console.log(`💰 Kurs: old=${oldKurs}, new=${newKurs}, changed=${kursChanged}`);
    console.log(`🚚 Koszt dostawy: old=${oldKosztDostawy}, new=${newKosztDostawy}, changed=${kosztDostawyChanged}`);
    console.log('📋 Products array received from frontend:', JSON.stringify(products, null, 2));
    
    // Сохраняем существующие файлы, если новые не загружены
    const finalProductInvoice = productInvoice || oldReceipt.productInvoice;
    const finalTransportInvoice = transportInvoice || oldReceipt.transportInvoice;
    
    console.log('📎 Files to save (PUT):', { 
      productInvoice: finalProductInvoice, 
      transportInvoice: finalTransportInvoice,
      newProductInvoice: productInvoice,
      newTransportInvoice: transportInvoice,
      oldProductInvoice: oldReceipt.productInvoice,
      oldTransportInvoice: oldReceipt.transportInvoice
    });
    
    // Вычисляем курс для обновления записи (парсим с заменой запятой на точку)
    const kurs = parseFloat(String(aktualnyKurs || '1').replace(',', '.')) || 1;
    const podatekAkcyzowyParsed = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.')) || 0;
    const rabatParsed = parseFloat(String(rabat || '0').replace(',', '.')) || 0;
    
    db.run(
      'UPDATE product_receipts SET dataPrzyjecia = ?, sprzedawca = ?, wartosc = ?, kosztDostawy = ?, aktualny_kurs = ?, podatek_akcyzowy = ?, rabat = ?, products = ?, productInvoice = ?, transportInvoice = ? WHERE id = ?',
      [date, sprzedawca || '', wartosc || 0, kosztDostawy || 0, kurs, podatekAkcyzowyParsed, rabatParsed, JSON.stringify(products), finalProductInvoice, finalTransportInvoice, id],
      function(err) {
        if (err) {
          console.error('❌ Database error:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log('✅ Product receipt updated with ID:', id);
        console.log('📎 Files saved (PUT):', { productInvoice: finalProductInvoice, transportInvoice: finalTransportInvoice });
        
        // Обновляем товары в working_sheets и products
        let processedCount = 0;
        let workingSheetsUpdated = 0;
        let productsUpdated = 0;
        let productsInserted = 0;
        let productsDeleted = 0;
        
        // Функция для последовательной обработки товаров
        const processProductsSequentially = async () => {
          try {
            // Вычисляем общее количество бутылок для расчета стоимости доставки на единицу
            // Исключаем aksesoria из расчета транспорта
            const totalBottles = products.reduce((total, product) => {
              if (product.typ === 'aksesoria') return total;
              return total + (product.ilosc || 0);
            }, 0);
            const kosztDostawyPerUnit = totalBottles > 0 ? Math.round((((kosztDostawy || 0) / totalBottles) * kurs) * 100) / 100 : 0;
            
            console.log(`💰 Delivery cost calculation (PUT): ${kosztDostawy || 0}€ / ${totalBottles} bottles * ${kurs} kurs = ${kosztDostawyPerUnit.toFixed(4)} zł per unit`);
            
            // Шаг 1: Получаем старые записи из products для этой приемки
            console.log('🔄 Step 1: Getting old product records from database...');
            const oldProductsFromDb = await new Promise((resolve, reject) => {
              db.all('SELECT * FROM products WHERE receipt_id = ?', [id], (err, rows) => {
                if (err) {
                  console.error('❌ Error fetching old products from database:', err);
                  reject(err);
                } else {
                  console.log(`✅ Found ${rows.length} old product records in database`);
                  resolve(rows);
                }
              });
            });
            
            // Группируем старые товары по kod и суммируем количества
            const oldProductsByKod = {};
            oldProductsFromDb.forEach(p => {
              if (!oldProductsByKod[p.kod]) {
                oldProductsByKod[p.kod] = {
                  kod: p.kod,
                  nazwa: p.nazwa,
                  kod_kreskowy: p.kod_kreskowy,
                  cena: p.cena,
                  ilosc: 0,
                  typ: null, // Будем брать из oldProducts JSON
                  dataWaznosci: null,
                  objetosc: null,
                  records: []
                };
              }
              oldProductsByKod[p.kod].ilosc += p.ilosc || 0;
              oldProductsByKod[p.kod].records.push(p);
            });
            
            // Дополняем данными из oldProducts JSON (тип, объем, дата)
            oldProducts.forEach(op => {
              if (oldProductsByKod[op.kod]) {
                oldProductsByKod[op.kod].typ = op.typ || oldProductsByKod[op.kod].typ;
                oldProductsByKod[op.kod].dataWaznosci = op.dataWaznosci || oldProductsByKod[op.kod].dataWaznosci;
                oldProductsByKod[op.kod].objetosc = op.objetosc || oldProductsByKod[op.kod].objetosc;
              }
            });
            
            // Группируем новые товары по kod и суммируем количества
            const newProductsByKod = {};
            products.forEach(p => {
              if (!newProductsByKod[p.kod]) {
                newProductsByKod[p.kod] = {
                  kod: p.kod,
                  nazwa: p.nazwa,
                  kod_kreskowy: p.kod_kreskowy,
                  cena: p.cena,
                  ilosc: 0,
                  typ: p.typ,
                  dataWaznosci: p.dataWaznosci,
                  objetosc: p.objetosc,
                  items: []
                };
              }
              newProductsByKod[p.kod].ilosc += p.ilosc || 0;
              newProductsByKod[p.kod].items.push(p);
            });
              
            // Шаг 2: Сравниваем старые и новые товары и обновляем только измененные
            console.log('🔄 Step 2: Comparing old and new products...');
            
            const allProductCodes = [...new Set([...Object.keys(oldProductsByKod), ...Object.keys(newProductsByKod)])];
            
            for (const productCode of allProductCodes) {
              const oldProduct = oldProductsByKod[productCode];
              const newProduct = newProductsByKod[productCode];
              
              if (!oldProduct && newProduct) {
                // Новый товар - создаем записи в products
                console.log(`➕ New product: ${productCode}`);
                for (const item of newProduct.items) {
              await new Promise((resolve, reject) => {
                    db.run(
                      'INSERT INTO products (kod, nazwa, kod_kreskowy, cena, ilosc, ilosc_aktualna, receipt_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                      [item.kod, item.nazwa, item.kod_kreskowy || null, item.cena || 0, item.ilosc, item.ilosc, id, (item.cena || 0) === 0 ? 'samples' : null],
                      function(err) {
                  if (err) {
                          console.error(`❌ Error inserting new product ${productCode}:`, err);
                    reject(err);
                  } else {
                          console.log(`✅ Created new product record: ${productCode} with ID: ${this.lastID}`);
                          productsInserted++;
                    resolve();
                  }
                      }
                    );
              });
            }
              } else if (oldProduct && !newProduct) {
                // Товар удален - удаляем записи из products
                console.log(`🗑️ Product removed: ${productCode}`);
                await new Promise((resolve, reject) => {
                  db.run('DELETE FROM products WHERE receipt_id = ? AND kod = ?', [id, productCode], function(err) {
                    if (err) {
                      console.error(`❌ Error deleting product ${productCode}:`, err);
                      reject(err);
                    } else {
                      console.log(`✅ Deleted product records: ${productCode}, rows affected: ${this.changes}`);
                      productsDeleted += this.changes;
                      resolve();
                    }
                  });
                });
              } else if (oldProduct && newProduct) {
                // Товар существует - сравниваем и обновляем только измененные поля
                console.log(`🔄 Product exists: ${productCode}, comparing changes...`);
                
                // Определяем, что изменилось
                const changes = {
                  ilosc: oldProduct.ilosc !== newProduct.ilosc,
                  nazwa: oldProduct.nazwa !== newProduct.nazwa,
                  kod_kreskowy: (oldProduct.kod_kreskowy || '') !== (newProduct.kod_kreskowy || ''),
                  cena: Math.abs((oldProduct.cena || 0) - (newProduct.cena || 0)) > 0.01,
                  typ: (oldProduct.typ || '') !== (newProduct.typ || ''),
                  dataWaznosci: (oldProduct.dataWaznosci || '') !== (newProduct.dataWaznosci || ''),
                  objetosc: (oldProduct.objetosc || '') !== (newProduct.objetosc || '')
                };
                
                const hasChanges = Object.values(changes).some(v => v);
                
                if (!hasChanges) {
                  console.log(`✅ No changes for ${productCode}, skipping update`);
                  continue;
                }
                
                console.log(`📝 Changes detected for ${productCode}:`, changes);
              
                // Если количество изменилось, нужно пересоздать записи в products
                if (changes.ilosc) {
                  console.log(`🔄 Quantity changed for ${productCode}: ${oldProduct.ilosc} → ${newProduct.ilosc}`);
                  
                  // Удаляем старые записи
              await new Promise((resolve, reject) => {
                    db.run('DELETE FROM products WHERE receipt_id = ? AND kod = ?', [id, productCode], function(err) {
                  if (err) {
                        console.error(`❌ Error deleting old product records ${productCode}:`, err);
                    reject(err);
                      } else {
                        console.log(`✅ Deleted old product records: ${productCode}, rows affected: ${this.changes}`);
                        resolve();
                      }
                    });
                  });
                  
                  // Создаем новые записи
                  for (const item of newProduct.items) {
                    await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO products (kod, nazwa, kod_kreskowy, cena, ilosc, ilosc_aktualna, receipt_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [item.kod, item.nazwa, item.kod_kreskowy || null, item.cena || 0, item.ilosc, item.ilosc, id, (item.cena || 0) === 0 ? 'samples' : null],
                      function(err) {
                        if (err) {
                            console.error(`❌ Error inserting updated product ${productCode}:`, err);
                          reject(err);
                        } else {
                            console.log(`✅ Created updated product record: ${productCode} with ID: ${this.lastID}`);
                        productsUpdated++;
                        resolve();
                        }
                      }
                    );
                    });
                  }
                  } else {
                  // Количество не изменилось - обновляем только измененные поля в существующих записях
                  console.log(`📝 Updating fields for ${productCode} (quantity unchanged)`);
                  
                  const updateFields = [];
                  const updateValues = [];
                  
                  if (changes.nazwa) {
                    updateFields.push('nazwa = ?');
                    updateValues.push(newProduct.nazwa);
                  }
                  if (changes.kod_kreskowy) {
                    updateFields.push('kod_kreskowy = ?');
                    updateValues.push(newProduct.kod_kreskowy || null);
                  }
                  if (changes.cena) {
                    updateFields.push('cena = ?');
                    updateValues.push(newProduct.cena || 0);
                  }
                  
                  if (updateFields.length > 0) {
                    updateValues.push(id, productCode);
                    await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE products SET ${updateFields.join(', ')} WHERE receipt_id = ? AND kod = ?`,
                        updateValues,
                      function(err) {
                        if (err) {
                            console.error(`❌ Error updating product fields ${productCode}:`, err);
                          reject(err);
                        } else {
                            console.log(`✅ Updated product fields: ${productCode}, rows affected: ${this.changes}`);
                            productsUpdated += this.changes;
                          resolve();
                        }
                      }
                    );
                });
                  }
                }
              }
            }
            
            // Шаг 3: Обновляем working_sheets только для товаров, где что-то изменилось
            console.log('🔄 Step 3: Updating working_sheets for changed products...');
            
            for (const productCode of allProductCodes) {
              const oldProduct = oldProductsByKod[productCode];
              const newProduct = newProductsByKod[productCode];
              
              if (!oldProduct && newProduct) {
                // Новый товар - создаем запись в working_sheets
                console.log(`➕ Creating working_sheets for new product: ${productCode}`);
                
                // Получаем общее количество из всех приемок
                const totalQuantityResult = await new Promise((resolve, reject) => {
                  db.get('SELECT SUM(ilosc) as total_ilosc FROM products WHERE kod = ?', [productCode], (err, result) => {
                    if (err) reject(err);
                    else resolve(result?.total_ilosc || 0);
                });
              });
              
                const sourceProduct = newProduct.items[0];
                const maxCena = Math.max(...newProduct.items.map(p => parseFloat(p.cena || 0)));
                const objetoscValue = parseFloat(String(sourceProduct.objetosc || '1').replace(',', '.')) || 1;
                const podatekAkcyzowyValue = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                const kosztDostawyPerUnitValue = Math.round((((kosztDostawy || 0) / (totalBottles || 1)) * kurs) * 100) / 100;
                const isBezalkoholoweOrFermentOrAksesoria = sourceProduct.typ === 'bezalkoholowe' || sourceProduct.typ === 'ferment' || sourceProduct.typ === 'aksesoria';
                const podatekValue = isBezalkoholoweOrFermentOrAksesoria ? 0 : (podatekAkcyzowyValue === 0 ? 0 : Math.round((podatekAkcyzowyValue * objetoscValue) * 100) / 100);
                // Для aksesoria транспорт не распределяется
                const kosztDostawyPerUnitForProduct = sourceProduct.typ === 'aksesoria' ? 0 : kosztDostawyPerUnitValue;
                const kosztWlasnyValue = parseFloat((maxCena * kurs + kosztDostawyPerUnitForProduct + podatekValue).toFixed(2));
                
              await new Promise((resolve, reject) => {
                  db.run(
                    'INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [productCode, sourceProduct.nazwa, totalQuantityResult, sourceProduct.kod_kreskowy || null, sourceProduct.typ || null, sprzedawca || null, maxCena, sourceProduct.dataWaznosci || null, sourceProduct.objetosc || null, kosztDostawyPerUnitForProduct, podatekValue, kosztWlasnyValue],
                    function(err) {
                  if (err) {
                        console.error(`❌ Error creating working_sheets for ${productCode}:`, err);
                    reject(err);
                      } else {
                        console.log(`✅ Created working_sheets for ${productCode}`);
                        workingSheetsUpdated++;
                        resolve();
                      }
                    }
                  );
                });
              } else if (oldProduct && !newProduct) {
                // Товар удален - проверяем, нужно ли удалить из working_sheets
                console.log(`🗑️ Checking if ${productCode} should be removed from working_sheets...`);
                
                const remainingCount = await new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count FROM products WHERE kod = ?', [productCode], (err, result) => {
                    if (err) reject(err);
                    else resolve(result?.count || 0);
                  });
                });
                
                if (remainingCount === 0) {
                  await new Promise((resolve, reject) => {
                    db.run('DELETE FROM working_sheets WHERE kod = ?', [productCode], function(err) {
                  if (err) {
                        console.error(`❌ Error removing ${productCode} from working_sheets:`, err);
                      reject(err);
                  } else {
                        console.log(`✅ Removed ${productCode} from working_sheets`);
                        resolve();
                      }
                    });
                    });
                  } else {
                  // Товар есть в других приемках - пересчитываем количество
                  const totalQuantityResult = await new Promise((resolve, reject) => {
                    db.get('SELECT SUM(ilosc) as total_ilosc FROM products WHERE kod = ?', [productCode], (err, result) => {
                      if (err) reject(err);
                      else resolve(result?.total_ilosc || 0);
                    });
                  });
                  
                  await new Promise((resolve, reject) => {
                    db.run('UPDATE working_sheets SET ilosc = ? WHERE kod = ?', [totalQuantityResult, productCode], function(err) {
                      if (err) {
                        console.error(`❌ Error updating ilosc in working_sheets for ${productCode}:`, err);
                        reject(err);
                      } else {
                        console.log(`✅ Updated ilosc in working_sheets for ${productCode}: ${totalQuantityResult}`);
                        workingSheetsUpdated++;
                  resolve();
                      }
                });
              });
            }
              } else if (oldProduct && newProduct) {
                // Товар существует - обновляем только измененные поля
                console.log(`🔄 Updating working_sheets for ${productCode}...`);
                
                // Получаем текущую запись из working_sheets
                const workingSheetRecord = await new Promise((resolve, reject) => {
                  db.get('SELECT * FROM working_sheets WHERE kod = ?', [productCode], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                  });
                });
                
                if (!workingSheetRecord) {
                  console.log(`⚠️ No working_sheets record for ${productCode}, creating new one...`);
                  // Создаем новую запись
                  const totalQuantityResult = await new Promise((resolve, reject) => {
                    db.get('SELECT SUM(ilosc) as total_ilosc FROM products WHERE kod = ?', [productCode], (err, result) => {
                      if (err) reject(err);
                      else resolve(result?.total_ilosc || 0);
                    });
                  });
                  
                  const sourceProduct = newProduct.items[0];
                  const maxCena = Math.max(...newProduct.items.map(p => parseFloat(p.cena || 0)));
                  const objetoscValue = parseFloat(String(sourceProduct.objetosc || '1').replace(',', '.')) || 1;
                  const podatekAkcyzowyValue = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                  const kosztDostawyPerUnitValue = Math.round((((kosztDostawy || 0) / (totalBottles || 1)) * kurs) * 100) / 100;
                  const isBezalkoholoweOrFermentOrAksesoria = sourceProduct.typ === 'bezalkoholowe' || sourceProduct.typ === 'ferment' || sourceProduct.typ === 'aksesoria';
                  const podatekValue = isBezalkoholoweOrFermentOrAksesoria ? 0 : (podatekAkcyzowyValue === 0 ? 0 : Math.round((podatekAkcyzowyValue * objetoscValue) * 100) / 100);
                  const kosztWlasnyValue = parseFloat((maxCena * kurs + kosztDostawyPerUnitValue + podatekValue).toFixed(2));
                  
              await new Promise((resolve, reject) => {
                        db.run(
                      'INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                      [productCode, sourceProduct.nazwa, totalQuantityResult, sourceProduct.kod_kreskowy || null, sourceProduct.typ || null, sprzedawca || null, maxCena, sourceProduct.dataWaznosci || null, sourceProduct.objetosc || null, kosztDostawyPerUnitForProduct, podatekValue, kosztWlasnyValue],
                          function(err) {
                  if (err) {
                          console.error(`❌ Error creating working_sheets for ${productCode}:`, err);
                    reject(err);
                            } else {
                          console.log(`✅ Created working_sheets for ${productCode}`);
                              workingSheetsUpdated++;
                              resolve();
                  }
                          }
                        );
                  });
                  continue;
                }
                
                // Определяем, что изменилось в working_sheets
                const wsChanges = {
                  ilosc: oldProduct.ilosc !== newProduct.ilosc, // Количество в приемке изменилось
                  nazwa: (oldProduct.nazwa || '') !== (newProduct.nazwa || ''),
                  kod_kreskowy: (oldProduct.kod_kreskowy || '') !== (newProduct.kod_kreskowy || ''),
                  typ: (oldProduct.typ || '') !== (newProduct.typ || ''),
                  dataWaznosci: (oldProduct.dataWaznosci || '') !== (newProduct.dataWaznosci || ''),
                  objetosc: (oldProduct.objetosc || '') !== (newProduct.objetosc || ''),
                  podatekAkcyzowy: podatekAkcyzowyChanged, // Изменился podatek akcyzowy (на литр) в приемке
                  kurs: kursChanged, // Изменился курс в приемке
                  kosztDostawy: kosztDostawyChanged // Изменилась общая стоимость доставки в приемке
                };
                
                const hasWsChanges = Object.values(wsChanges).some(v => v);
                
                // Если изменился только курс, kosztDostawy или podatekAkcyzowy, но не товары, все равно нужно обновить соответствующие поля
                const needsKosztDostawyUpdate = kursChanged || kosztDostawyChanged;
                const needsPodatekAkcyzowyUpdate = podatekAkcyzowyChanged && !wsChanges.objetosc; // Если изменился только podatek_akcyzowy (не через objetosc)
                const needsReceiptParamsUpdate = needsKosztDostawyUpdate || needsPodatekAkcyzowyUpdate;
                  
                if (!hasWsChanges && !needsReceiptParamsUpdate) {
                  console.log(`✅ No working_sheets changes for ${productCode}, skipping update`);
                  continue;
                }
                
                // Если изменились только параметры приемки (курс, kosztDostawy, podatek_akcyzowy), но не товары, обновляем соответствующие поля
                // Но только если товар существует и в старой, и в новой версии приемки
                if (!hasWsChanges && needsReceiptParamsUpdate && oldProduct && newProduct) {
                  const updateReason = [];
                  if (kursChanged) updateReason.push('kurs');
                  if (kosztDostawyChanged) updateReason.push('kosztDostawy');
                  if (needsPodatekAkcyzowyUpdate) updateReason.push('podatek_akcyzowy');
                  console.log(`💰 Only receipt params changed for ${productCode} (${updateReason.join(', ')}), updating working_sheets`);
                  
                  // Сохраняем снимок ДО изменений
                  await new Promise((resolve) => {
                    db.run(
                      `INSERT INTO working_sheets_history 
                       (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny, action, receipt_id)
                       SELECT kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny,
                              'before_receipt', ?
                       FROM working_sheets WHERE kod = ?`,
                      [id, productCode],
                      function(err) {
                    if (err) {
                          console.error(`❌ Error saving snapshot for ${productCode}:`, err);
                      } else {
                          console.log(`✅ Snapshot saved for ${productCode}`);
                        }
                        resolve();
                      }
                    );
                  });
                  
                  // Получаем текущую запись из working_sheets
                  const workingSheetRecord = await new Promise((resolve, reject) => {
                    db.get('SELECT * FROM working_sheets WHERE kod = ?', [productCode], (err, row) => {
                      if (err) reject(err);
                      else resolve(row);
                    });
                  });
                  
                  if (!workingSheetRecord) {
                    console.log(`⚠️ No working_sheets record for ${productCode}, skipping`);
                    continue;
                  }
                  
                  // Пересчитываем koszt_dostawy_per_unit с новым курсом (если изменился курс или kosztDostawy)
                  const kosztDostawyPerUnitValue = Math.round((((kosztDostawy || 0) / (totalBottles || 1)) * kurs) * 100) / 100;
                  
                  // Пересчитываем podatek_akcyzowy (если изменился podatek_akcyzowy на литр)
                  const sourceProduct = newProduct.items[0];
                  const objetoscValue = parseFloat(String(sourceProduct.objetosc || '1').replace(',', '.')) || 1;
                  const podatekAkcyzowyValue = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                  const isBezalkoholoweOrFermentOrAksesoria = sourceProduct.typ === 'bezalkoholowe' || sourceProduct.typ === 'ferment' || sourceProduct.typ === 'aksesoria';
                  const podatekValue = isBezalkoholoweOrFermentOrAksesoria ? 0 : (podatekAkcyzowyValue === 0 ? 0 : Math.round((podatekAkcyzowyValue * objetoscValue) * 100) / 100);
                  
                  // Используем новое значение podatek_akcyzowy, если оно изменилось, иначе текущее из БД
                  const finalPodatekAkcyzowy = needsPodatekAkcyzowyUpdate ? podatekValue : (workingSheetRecord.podatek_akcyzowy || 0);
                  
                  // Для aksesoria транспорт не распределяется
                  const kosztDostawyPerUnitForProduct = sourceProduct.typ === 'aksesoria' ? 0 : kosztDostawyPerUnitValue;
                  // Используем новое значение koszt_dostawy_per_unit, если оно изменилось, иначе текущее из БД
                  const finalKosztDostawyPerUnit = needsKosztDostawyUpdate ? kosztDostawyPerUnitForProduct : (workingSheetRecord.koszt_dostawy_per_unit || 0);
                  
                  // Пересчитываем koszt_wlasny
                  const maxCena = Math.max(...newProduct.items.map(p => parseFloat(p.cena || 0)));
                  const kosztWlasnyValue = parseFloat((maxCena * kurs + finalKosztDostawyPerUnit + finalPodatekAkcyzowy).toFixed(2));
                  
                  // Формируем UPDATE запрос только для измененных полей
                  const updateFields = [];
                  const updateValues = [];
                  
                  if (needsKosztDostawyUpdate) {
                    updateFields.push('koszt_dostawy_per_unit = ?');
                    updateValues.push(kosztDostawyPerUnitForProduct);
                      }
                      
                  if (needsPodatekAkcyzowyUpdate) {
                    updateFields.push('podatek_akcyzowy = ?');
                    updateValues.push(podatekValue);
                  }
                  
                  // Всегда обновляем koszt_wlasny, так как он зависит от всех параметров
                  updateFields.push('koszt_wlasny = ?');
                  updateValues.push(kosztWlasnyValue);
                  
                  // Обновляем working_sheets
                  await new Promise((resolve, reject) => {
                        db.run(
                      `UPDATE working_sheets SET ${updateFields.join(', ')} WHERE kod = ?`,
                      [...updateValues, productCode],
                          function(err) {
                            if (err) {
                              console.error(`❌ Error updating working_sheets for ${productCode}:`, err);
                              reject(err);
                            } else {
                          console.log(`✅ Updated working_sheets for ${productCode}: ${updateFields.join(', ')}, koszt_wlasny: ${kosztWlasnyValue}`);
                              workingSheetsUpdated++;
                              resolve();
                            }
                          }
                        );
                  });
                  continue;
                }
                
                console.log(`📝 Working_sheets changes for ${productCode}:`, wsChanges);
                
                // Сохраняем снимок ДО изменений
                await new Promise((resolve) => {
                        db.run(
                    `INSERT INTO working_sheets_history 
                     (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny, action, receipt_id)
                     SELECT kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny,
                            'before_receipt', ?
                     FROM working_sheets WHERE kod = ?`,
                    [id, productCode],
                          function(err) {
                            if (err) {
                        console.error(`❌ Error saving snapshot for ${productCode}:`, err);
                            } else {
                        console.log(`✅ Snapshot saved for ${productCode}`);
                      }
                              resolve();
                            }
                        );
                });
                
                // Формируем UPDATE запрос только для измененных полей
                const updateFields = [];
                const updateValues = [];
                
                // Если количество в приемке изменилось, пересчитываем общее количество
                if (wsChanges.ilosc) {
                  const totalQuantityResult = await new Promise((resolve, reject) => {
                    db.get('SELECT SUM(ilosc) as total_ilosc FROM products WHERE kod = ?', [productCode], (err, result) => {
                      if (err) reject(err);
                      else resolve(result?.total_ilosc || 0);
                  });
                });
                  updateFields.push('ilosc = ?');
                  updateValues.push(totalQuantityResult);
                  console.log(`📊 Quantity changed for ${productCode}: recalculated total = ${totalQuantityResult}`);
                }
                
                if (wsChanges.nazwa) {
                  updateFields.push('nazwa = ?');
                  updateValues.push(newProduct.nazwa);
                }
                if (wsChanges.kod_kreskowy) {
                  updateFields.push('kod_kreskowy = ?');
                  updateValues.push(newProduct.kod_kreskowy || null);
                }
                if (wsChanges.typ) {
                  updateFields.push('typ = ?');
                  updateValues.push(newProduct.typ || null);
                }
                if (wsChanges.dataWaznosci) {
                  updateFields.push('data_waznosci = ?');
                  updateValues.push(newProduct.dataWaznosci || null);
                }
                // Пересчитываем podatek_akcyzowy только если изменился объем ИЛИ podatekAkcyzowy (на литр) из приемки
                if (wsChanges.objetosc || wsChanges.podatekAkcyzowy) {
                  if (wsChanges.objetosc) {
                    updateFields.push('objetosc = ?');
                    updateValues.push(newProduct.objetosc || null);
                  }
                  
                  // Пересчитываем podatek_akcyzowy = podatekAkcyzowy (на литр) * objetosc
                  const sourceProduct = newProduct.items[0];
                  const objetoscValue = parseFloat(String(sourceProduct.objetosc || '1').replace(',', '.')) || 1;
                  const podatekAkcyzowyValue = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                  const isBezalkoholoweOrFermentOrAksesoria = sourceProduct.typ === 'bezalkoholowe' || sourceProduct.typ === 'ferment' || sourceProduct.typ === 'aksesoria';
                  const podatekValue = isBezalkoholoweOrFermentOrAksesoria ? 0 : (podatekAkcyzowyValue === 0 ? 0 : Math.round((podatekAkcyzowyValue * objetoscValue) * 100) / 100);
                  
                  updateFields.push('podatek_akcyzowy = ?');
                  updateValues.push(podatekValue);
            
                  // Пересчитываем koszt_wlasny с новым podatek_akcyzowy
                  const maxCena = Math.max(...newProduct.items.map(p => parseFloat(p.cena || 0)));
                  const kosztDostawyPerUnitValue = Math.round((((kosztDostawy || 0) / (totalBottles || 1)) * kurs) * 100) / 100;
                  // Для aksesoria транспорт не распределяется
                  const kosztDostawyPerUnitForProduct = sourceProduct.typ === 'aksesoria' ? 0 : kosztDostawyPerUnitValue;
                  const kosztWlasnyValue = parseFloat((maxCena * kurs + kosztDostawyPerUnitForProduct + podatekValue).toFixed(2));
                  
                  updateFields.push('koszt_wlasny = ?');
                  updateValues.push(kosztWlasnyValue);
                }
                
                // Обновляем цену, если она изменилась
                const maxCena = Math.max(...newProduct.items.map(p => parseFloat(p.cena || 0)));
                if (Math.abs((workingSheetRecord.cena || 0) - maxCena) > 0.01) {
                  updateFields.push('cena = ?');
                  updateValues.push(maxCena);
                  
                  // Если цена изменилась, пересчитываем koszt_wlasny, используя ТЕКУЩЕЕ значение podatek_akcyzowy из БД
                  const kosztDostawyPerUnitValue = Math.round((((kosztDostawy || 0) / (totalBottles || 1)) * kurs) * 100) / 100;
                  // Для aksesoria транспорт не распределяется
                  const sourceProduct = newProduct.items[0];
                  const kosztDostawyPerUnitForProduct = sourceProduct.typ === 'aksesoria' ? 0 : kosztDostawyPerUnitValue;
                  const currentPodatekAkcyzowy = workingSheetRecord.podatek_akcyzowy || 0;
                  const kosztWlasnyValue = parseFloat((maxCena * kurs + kosztDostawyPerUnitForProduct + currentPodatekAkcyzowy).toFixed(2));
                  
                  // Удаляем старое значение koszt_wlasny, если оно уже есть
                  const kosztWlasnyIndex = updateFields.indexOf('koszt_wlasny = ?');
                  if (kosztWlasnyIndex !== -1) {
                    updateValues.splice(kosztWlasnyIndex, 1);
                    updateFields.splice(kosztWlasnyIndex, 1);
                  }
                  
                  updateFields.push('koszt_wlasny = ?');
                  updateValues.push(kosztWlasnyValue);
                }
                
                // Обновляем sprzedawca, если он изменился
                if ((workingSheetRecord.sprzedawca || '') !== (sprzedawca || '')) {
                  updateFields.push('sprzedawca = ?');
                  updateValues.push(sprzedawca || null);
            }
                
                // Обновляем koszt_dostawy_per_unit, если изменился kosztDostawy или kurs
                const kosztDostawyPerUnitValue = Math.round((((kosztDostawy || 0) / (totalBottles || 1)) * kurs) * 100) / 100;
                // Для aksesoria транспорт не распределяется
                const sourceProduct = newProduct.items[0];
                const kosztDostawyPerUnitForProduct = sourceProduct.typ === 'aksesoria' ? 0 : kosztDostawyPerUnitValue;
                const kosztDostawyPerUnitChanged = Math.abs((workingSheetRecord.koszt_dostawy_per_unit || 0) - kosztDostawyPerUnitForProduct) > 0.01;
                
                // Обновляем, если значение изменилось ИЛИ если изменился курс или kosztDostawy в приемке
                if (kosztDostawyPerUnitChanged || kursChanged || kosztDostawyChanged) {
                  updateFields.push('koszt_dostawy_per_unit = ?');
                  updateValues.push(kosztDostawyPerUnitForProduct);
                  
                  // Пересчитываем koszt_wlasny, используя ТЕКУЩЕЕ значение podatek_akcyzowy из БД
                  const maxCena = Math.max(...newProduct.items.map(p => parseFloat(p.cena || 0)));
                  const currentPodatekAkcyzowy = workingSheetRecord.podatek_akcyzowy || 0;
                  const kosztWlasnyValue = parseFloat((maxCena * kurs + kosztDostawyPerUnitForProduct + currentPodatekAkcyzowy).toFixed(2));
                  
                  // Удаляем старое значение koszt_wlasny, если оно уже есть
                  const kosztWlasnyIndex = updateFields.indexOf('koszt_wlasny = ?');
                  if (kosztWlasnyIndex !== -1) {
                    updateValues.splice(kosztWlasnyIndex, 1);
                    updateFields.splice(kosztWlasnyIndex, 1);
                  }
                  
                  updateFields.push('koszt_wlasny = ?');
                  updateValues.push(kosztWlasnyValue);
                }
                
                if (updateFields.length > 0) {
                  updateValues.push(productCode);
                  await new Promise((resolve, reject) => {
                    db.run(
                      `UPDATE working_sheets SET ${updateFields.join(', ')} WHERE kod = ?`,
                      updateValues,
                      function(err) {
                        if (err) {
                          console.error(`❌ Error updating working_sheets for ${productCode}:`, err);
                          reject(err);
                        } else {
                          console.log(`✅ Updated working_sheets for ${productCode}, fields: ${updateFields.join(', ')}`);
                          workingSheetsUpdated++;
                          resolve();
              }
            }
                    );
                  });
                }
              }
            }
            
            // Шаг 4: Отправляем ответ
            console.log(`🎉 Update processing complete: ${workingSheetsUpdated} working_sheets updated, ${productsUpdated} products updated, ${productsInserted} products created, ${productsDeleted} products deleted`);
            
            res.json({ 
              message: 'Product receipt updated successfully',
              workingSheetsUpdated: workingSheetsUpdated,
              productsUpdated: productsUpdated,
              productsCreated: productsInserted,
              productsDeleted: productsDeleted
            });
            
          } catch (error) {
            console.error('❌ Error during product processing:', error);
            res.status(500).json({ error: 'Failed to update working sheets: ' + error.message });
          }
        };
        
        // Запускаем последовательную обработку и ждем завершения
        processProductsSequentially().then(() => {
          console.log('✅ All product processing completed successfully');
        }).catch((error) => {
          console.error('❌ Error during product processing:', error);
          res.status(500).json({ error: 'Failed to update working sheets: ' + error.message });
        });
      }
    );
  });
});

app.delete('/api/product-receipts/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📦 DELETE /api/product-receipts/${id} - Deleting product receipt`);
  
  // 1) Считываем строку приёмки вместе с товарами и датой
  db.get('SELECT products, dataPrzyjecia FROM product_receipts WHERE id = ?', [id], (err, receiptRow) => {
    if (err) {
      console.error('❌ DB error reading receipt:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!receiptRow) {
      console.log(`❌ Receipt ${id} not found`);
      return res.status(404).json({ error: 'Product receipt not found' });
    }
    
    const products = JSON.parse(receiptRow.products || '[]');
    const receiptDate = receiptRow.dataPrzyjecia;
    const receiptDateOnly = (receiptDate || '').toString().substring(0,10);
    console.log(`🔍 ${products.length} product rows, date=${receiptDateOnly}`);

    // 2) Удаляем связанные строки из products
    db.run('DELETE FROM products WHERE receipt_id = ?', [id], function (prodErr) {
      if (prodErr) {
        console.error('❌ Error deleting products:', prodErr);
        return res.status(500).json({ error: prodErr.message });
      }
      console.log(`✅ Deleted ${this.changes} product rows`);

      // 3) Удаляем саму приёмку и правим working_sheets
        proceedToDeleteReceipt();
      
      function proceedToDeleteReceipt() {
        db.run('DELETE FROM product_receipts WHERE id = ?', [id], function (recErr) {
          if (recErr) {
            console.error('❌ Error deleting receipt:', recErr);
            return res.status(500).json({ error: recErr.message });
          }
          console.log('✅ Product receipt row deleted');

          // ==== перерасчёт working_sheets (старый код оставляем без изменений) ====
          let processedWS = 0;
          let wsDeleted = 0;
          let wsUpdated = 0;

          if (products.length === 0) {
            return res.json({ message: 'Receipt deleted (empty)', workingSheetsDeleted: 0, workingSheetsUpdated: 0, priceHistoryDeleted: 0 });
          }

          products.forEach(product => {
            db.get('SELECT * FROM working_sheets WHERE kod = ?', [product.kod], (wsErr, wsRow) => {
              if (wsErr) {
                console.error('❌ working_sheets read error:', wsErr);
                finalize();
                  return;
                }
                
              if (!wsRow) {
                finalize();
                return;
              }

              // Сколько приёмок осталось
              db.get('SELECT COUNT(*) as cnt FROM products WHERE kod = ?', [product.kod], (cntErr, cntRow) => {
                if (cntErr) {
                  console.error('❌ count error:', cntErr);
                  finalize();
                  return;
                }

                const leftReceipts = cntRow.cnt || 0;
                if (leftReceipts === 0) {
                  // Ищем снимок ДО этой приемки в working_sheets_history
                  console.log(`🔍 Looking for snapshot before receipt ${id} for product ${product.kod}`);
                  db.get(
                    `SELECT * FROM working_sheets_history 
                     WHERE kod = ? AND action = 'before_receipt' AND receipt_id = ?
                     ORDER BY created_at DESC LIMIT 1`,
                    [product.kod, id],
                    (snapshotErr, snapshot) => {
                      if (snapshotErr) {
                        console.error(`❌ Error finding snapshot for ${product.kod}:`, snapshotErr);
                        finalize();
                        return;
                      }
                      
                      if (snapshot) {
                        // Восстанавливаем данные из снимка ДО приемки
                        console.log(`🔄 Restoring ${product.kod} from snapshot (receipt_id: ${id})`);
                        db.run(
                          `UPDATE working_sheets SET 
                            nazwa = ?,
                            ilosc = ?,
                            kod_kreskowy = ?,
                            typ = ?,
                            sprzedawca = ?,
                            cena = ?,
                            data_waznosci = ?,
                            objetosc = ?,
                            koszt_dostawy_per_unit = ?
                          WHERE kod = ?`,
                          [
                            snapshot.nazwa,
                            snapshot.ilosc,
                            snapshot.kod_kreskowy,
                            snapshot.typ,
                            snapshot.sprzedawca,
                            snapshot.cena,
                            snapshot.data_waznosci,
                            snapshot.objetosc,
                            snapshot.koszt_dostawy_per_unit,
                            product.kod
                          ],
                          function(restoreErr) {
                            if (restoreErr) {
                              console.error(`❌ Error restoring ${product.kod}:`, restoreErr);
                            } else {
                              console.log(`✅ Restored ${product.kod} to state before receipt ${id}`);
                              wsUpdated++;
                            }
                            
                            // Удаляем снимок из истории
                            db.run('DELETE FROM working_sheets_history WHERE receipt_id = ?', [id], (historyErr) => {
                              if (historyErr) {
                                console.error(`❌ Error deleting history for receipt ${id}:`, historyErr);
                              } else {
                                console.log(`🗑️ Deleted history records for receipt ${id}`);
                              }
                              finalize();
                            });
                          }
                        );
                      } else {
                        // Снимка нет - товар был создан из приемки, удаляем
                        console.log(`🗑️ No snapshot found for ${product.kod}, deleting from working_sheets`);
                  db.run('DELETE FROM working_sheets WHERE kod = ?', [product.kod], function (delErr) {
                    if (!delErr) wsDeleted++;
                    finalize();
              });
                      }
                    }
                  );
            } else {
                  // пересчитать количество (и максимальную цену)
                  db.get('SELECT SUM(ilosc) as total_ilosc, MAX(cena) as max_cena FROM products WHERE kod = ?', [product.kod], (sumErr, sumRow) => {
                    if (sumErr) return finalize();
                    const qty = sumRow.total_ilosc || 0;
                    const price = sumRow.max_cena || 0;
                    db.run('UPDATE working_sheets SET ilosc = ?, cena = ? WHERE kod = ?', [qty, price, product.kod], function (upErr) {
                      if (!upErr) wsUpdated++;
                      finalize();
                    });
                  });
                }
              });
            });
          });

          function finalize() {
            processedWS++;
            if (processedWS === products.length) {
              res.json({ message: 'Product receipt deleted successfully', workingSheetsDeleted: wsDeleted, workingSheetsUpdated: wsUpdated, priceHistoryDeleted: 0 });
          }
        }
      });
      }
    });
  });
});



// Получить архивированные записи
app.get('/api/working-sheets/archived', (req, res) => {
  console.log('📦 GET /api/working-sheets/archived - Fetching archived working sheets');
  
  if (!db) {
    console.error('❌ Database not available');
    return res.status(500).json({ error: 'Database not available' });
  }
  
  db.all('SELECT * FROM working_sheets WHERE archived = 1 ORDER BY archived_at DESC', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`✅ Found ${rows.length} archived working sheets`);
    res.json(rows || []);
  });
});

// Working Sheets API
app.get('/api/working-sheets', (req, res) => {
  console.log('📝 GET /api/working-sheets - Fetching all working sheets');
  
  // Проверяем, что база данных доступна
  if (!db) {
    console.error('❌ Database not available');
    return res.status(500).json({ error: 'Database not available' });
  }
  
  db.all('SELECT * FROM working_sheets WHERE archived = 0 OR archived IS NULL ORDER BY id DESC', (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`✅ Found ${rows.length} working sheets`);
    res.json(rows || []);
  });
});

// Simple search working sheets for invoices (includes products with zero stock)
app.get('/api/working-sheets/search-simple', (req, res) => {
  const { query } = req.query;
  console.log(`🔍 GET /api/working-sheets/search-simple - Simple search with query: "${query}"`);
  
  if (query === undefined || query === null || query.trim() === '') {
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  const searchQuery = `%${query}%`;
  
  db.all(`
    SELECT DISTINCT kod, nazwa, cena_sprzedazy
    FROM working_sheets 
    WHERE (archived = 0 OR archived IS NULL)
      AND (kod LIKE ? OR nazwa LIKE ? OR kod_kreskowy LIKE ?)
    ORDER BY 
      CASE 
        WHEN kod LIKE ? THEN 0
        WHEN nazwa LIKE ? THEN 1
        ELSE 2
      END,
      kod
    LIMIT 50
  `, [searchQuery, searchQuery, searchQuery, searchQuery, searchQuery], (err, rows) => {
    if (err) {
      console.error('❌ Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Found ${rows.length} products (simple search)`);
    res.json(rows || []);
  });
});

// Search working sheets
app.get('/api/working-sheets/search', (req, res) => {
  const { query, client_id, include_zero_stock, for_reservation } = req.query;
  console.log(`🔍 GET /api/working-sheets/search - Searching working sheets with query: "${query}"${client_id ? `, client_id: ${client_id}` : ''}${include_zero_stock ? ', include_zero_stock: true' : ''}${for_reservation ? ', for_reservation: true' : ''}`);
  
  if (query === undefined || query === null) {
    console.log('❌ Validation failed: query parameter is required');
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  // Если query пустой, используем '%' для поиска всех
  const searchQuery = query.trim() === '' ? '%' : `%${query}%`;
  const startsWithQuery = query.trim() === '' ? '%' : `${query}%`;

  // Режим для резервации: одна строка на товар с суммарным остатком (основной + семплы)
  if (for_reservation === 'true') {
    const reservationQuery = client_id ? `
      WITH ws_products AS (
        SELECT w.kod, MAX(w.nazwa) as nazwa, SUM(w.ilosc) as ilosc_main
        FROM working_sheets w
        WHERE (w.kod LIKE ? OR w.nazwa LIKE ? OR w.kod_kreskowy LIKE ?)
        GROUP BY w.kod
      ),
      reserved_products AS (
        SELECT rp.product_kod as kod,
          SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc_reserved
        FROM reservation_products rp
        INNER JOIN reservations r ON rp.reservation_id = r.id
        WHERE r.status = 'aktywna'
        GROUP BY rp.product_kod
      ),
      client_reservations AS (
        SELECT rp.product_kod as kod,
          SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc_client_reserved
        FROM reservation_products rp
        INNER JOIN reservations r ON rp.reservation_id = r.id
        WHERE r.status = 'aktywna' AND r.client_id = ?
        GROUP BY rp.product_kod
      )
      SELECT ws.kod, ws.nazwa,
        COALESCE(ws.ilosc_main, 0) as ilosc,
        COALESCE(rp.ilosc_reserved, 0) as ilosc_reserved,
        COALESCE(cr.ilosc_client_reserved, 0) as ilosc_client_reserved,
        NULL as status,
        CASE WHEN ws.kod LIKE ? THEN 0 WHEN ws.nazwa LIKE ? THEN 1 ELSE 2 END as match_priority
      FROM ws_products ws
      LEFT JOIN reserved_products rp ON ws.kod = rp.kod
      LEFT JOIN client_reservations cr ON ws.kod = cr.kod
      WHERE COALESCE(ws.ilosc_main, 0) > 0
      ORDER BY match_priority, ws.kod, ws.nazwa
      LIMIT ${query.trim() === '' ? 500 : 50}
    ` : `
      WITH ws_products AS (
        SELECT w.kod, MAX(w.nazwa) as nazwa, SUM(w.ilosc) as ilosc_main
        FROM working_sheets w
        WHERE (w.kod LIKE ? OR w.nazwa LIKE ? OR w.kod_kreskowy LIKE ?)
        GROUP BY w.kod
      ),
      reserved_products AS (
        SELECT rp.product_kod as kod,
          SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc_reserved
        FROM reservation_products rp
        INNER JOIN reservations r ON rp.reservation_id = r.id
        WHERE r.status = 'aktywna'
        GROUP BY rp.product_kod
      )
      SELECT ws.kod, ws.nazwa,
        COALESCE(ws.ilosc_main, 0) as ilosc,
        COALESCE(rp.ilosc_reserved, 0) as ilosc_reserved,
        NULL as status,
        CASE WHEN ws.kod LIKE ? THEN 0 WHEN ws.nazwa LIKE ? THEN 1 ELSE 2 END as match_priority
      FROM ws_products ws
      LEFT JOIN reserved_products rp ON ws.kod = rp.kod
      WHERE COALESCE(ws.ilosc_main, 0) > 0
      ORDER BY match_priority, ws.kod, ws.nazwa
      LIMIT ${query.trim() === '' ? 500 : 50}
    `;

    const reservationParams = client_id
      ? [searchQuery, searchQuery, searchQuery, client_id, startsWithQuery, searchQuery]
      : [searchQuery, searchQuery, searchQuery, startsWithQuery, searchQuery];

    db.all(reservationQuery, reservationParams, (err, rows) => {
      if (err) {
        console.error('❌ Database error (for_reservation):', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Found ${rows.length} products (for_reservation) matching "${query}"`);
      res.json(rows || []);
    });
    return;
  }

  // Упрощённая логика поиска: запускаем 3 простых запроса параллельно и объединяем в JS.
  // 1) working_sheets — основной товар (суммарно по kod)
  // 2) products (status='samples') — семплы
  // 3) reservation_products + reservations — все активные резервации (общие и по клиенту)
  const includeZero = include_zero_stock === 'true';
  const limitRows = query.trim() === '' ? 500 : 50;

  const wsPromise = new Promise((resolve, reject) => {
    db.all(
      `SELECT w.kod, MAX(w.nazwa) as nazwa, SUM(w.ilosc) as ilosc_main
       FROM working_sheets w
       WHERE (w.kod LIKE ? OR w.nazwa LIKE ? OR w.kod_kreskowy LIKE ?)
       GROUP BY w.kod`,
      [searchQuery, searchQuery, searchQuery],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });

  const samplesPromise = new Promise((resolve, reject) => {
    db.all(
      `SELECT kod, MAX(nazwa) as nazwa, SUM(ilosc) as ilosc_samples
       FROM products
       WHERE (kod LIKE ? OR nazwa LIKE ? OR kod_kreskowy LIKE ?)
         AND status = 'samples'
       GROUP BY kod
       HAVING SUM(ilosc) > 0`,
      [searchQuery, searchQuery, searchQuery],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });

  const reservationsPromise = new Promise((resolve, reject) => {
    db.all(
      `SELECT rp.product_kod as kod,
              SUM(rp.ilosc - COALESCE(rp.ilosc_wydane, 0)) as ilosc_reserved,
              SUM(CASE WHEN r.client_id = ? THEN rp.ilosc - COALESCE(rp.ilosc_wydane, 0) ELSE 0 END) as ilosc_client_reserved
       FROM reservation_products rp
       INNER JOIN reservations r ON rp.reservation_id = r.id
       WHERE r.status = 'aktywna'
       GROUP BY rp.product_kod`,
      [client_id || 0],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });

  Promise.all([wsPromise, samplesPromise, reservationsPromise])
    .then(([wsRows, samplesRows, reservationsRows]) => {
      // Маппы для быстрого поиска
      const samplesByKod = new Map();
      samplesRows.forEach(r => samplesByKod.set(r.kod, r.ilosc_samples || 0));

      const reservationsByKod = new Map();
      reservationsRows.forEach(r => reservationsByKod.set(r.kod, {
        ilosc_reserved: r.ilosc_reserved || 0,
        ilosc_client_reserved: r.ilosc_client_reserved || 0
      }));

      // Все коды товаров, которые есть в working_sheets
      const wsCodes = new Set(wsRows.map(r => r.kod));

      // Сортировка: точное/префиксное совпадение по kod в начале, далее по nazwa
      const matchPriority = (kod, nazwa) => {
        const q = query.trim().toLowerCase();
        if (!q) return 2;
        if ((kod || '').toLowerCase().startsWith(q)) return 0;
        if ((nazwa || '').toLowerCase().includes(q)) return 1;
        return 2;
      };

      const result = [];

      // Основные строки — working_sheets
      wsRows.forEach(ws => {
        const samplesQty = samplesByKod.get(ws.kod) || 0;
        const mainOnly = (ws.ilosc_main || 0) - samplesQty;
        if (!includeZero && mainOnly <= 0) return;

        const reserved = reservationsByKod.get(ws.kod) || { ilosc_reserved: 0, ilosc_client_reserved: 0 };
        const row = {
          kod: ws.kod,
          nazwa: ws.nazwa,
          ilosc: mainOnly,
          ilosc_reserved: reserved.ilosc_reserved,
          status: null,
          _sort_priority: matchPriority(ws.kod, ws.nazwa)
        };
        if (client_id) row.ilosc_client_reserved = reserved.ilosc_client_reserved;
        result.push(row);
      });

      // Строки семплов
      samplesRows.forEach(sp => {
        const sampleQty = sp.ilosc_samples || 0;
        if (sampleQty <= 0) return;

        const q = query.trim().toLowerCase();
        const matchesSearch = !q
          || (sp.kod || '').toLowerCase().includes(q)
          || (sp.nazwa || '').toLowerCase().includes(q);
        // Показываем семплы, если есть основная строка по kod ИЛИ если они подходят под поиск
        if (!wsCodes.has(sp.kod) && !matchesSearch) return;

        const reserved = reservationsByKod.get(sp.kod) || { ilosc_reserved: 0, ilosc_client_reserved: 0 };
        const row = {
          kod: sp.kod,
          nazwa: `${sp.nazwa} (samples)`,
          ilosc: sampleQty,
          ilosc_reserved: reserved.ilosc_reserved,
          status: 'samples',
          _sort_priority: matchPriority(sp.kod, sp.nazwa)
        };
        if (client_id) row.ilosc_client_reserved = reserved.ilosc_client_reserved;
        result.push(row);
      });

      // Сортировка
      result.sort((a, b) => {
        if (a._sort_priority !== b._sort_priority) return a._sort_priority - b._sort_priority;
        if (a.kod !== b.kod) return a.kod.localeCompare(b.kod);
        // в рамках одного kod: основной (status=null) до семплов
        if ((a.status || '') !== (b.status || '')) return (a.status || '').localeCompare(b.status || '');
        return (a.nazwa || '').localeCompare(b.nazwa || '');
      });

      // Удаляем служебное поле и применяем лимит
      const finalRows = result.slice(0, limitRows).map(({ _sort_priority, ...rest }) => rest);

      console.log(`✅ Found ${finalRows.length} products matching "${query}"`);
      res.json(finalRows);
    })
    .catch(err => {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
    });
});

app.post('/api/working-sheets', (req, res) => {
  const { data, produkt_id, kod, nazwa, ilosc, typ } = req.body;
  console.log('📝 POST /api/working-sheets - Creating new working sheet:', { kod, nazwa, ilosc, typ });
  
  if (!data || !kod || !nazwa || !ilosc) {
    console.log('❌ Validation failed: kod, nazwa, and ilosc are required');
    return res.status(400).json({ error: 'Kod, nazwa, and ilosc are required' });
  }
  
  db.run(
    'INSERT INTO working_sheets (kod, nazwa, ilosc, typ) VALUES (?, ?, ?, ?)',
    [kod, nazwa, ilosc, typ || 'sprzedaz'],
    function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Working sheet created with ID: ${this.lastID}`);
      res.json({ id: this.lastID, message: 'Working sheet added successfully' });
    }
  );
});

// Добавляем endpoint для удаления working sheet
app.delete('/api/working-sheets/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📝 DELETE /api/working-sheets/${id} - Deleting working sheet`);
  
  // Сначала проверяем, существует ли запись
  db.get('SELECT * FROM working_sheets WHERE id = ?', [id], (err, existingRecord) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!existingRecord) {
      console.log(`❌ Working sheet with ID ${id} not found`);
      return res.status(404).json({ error: 'Working sheet not found' });
    }
    
    console.log(`🔄 Found existing record: ${existingRecord.kod} (ilosc: ${existingRecord.ilosc})`);
    
    // Удаляем запись
    db.run('DELETE FROM working_sheets WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      console.log(`✅ Working sheet ${id} (${existingRecord.kod}) deleted successfully`);
      res.json({ 
        message: 'Working sheet deleted successfully',
        id: id,
        kod: existingRecord.kod,
        nazwa: existingRecord.nazwa
      });
    });
  });
});

// Endpoint для получения курса валюты по коду товара
app.get('/api/working-sheets/kurs/:kod', (req, res) => {
  const { kod } = req.params;
  console.log(`💰 GET /api/working-sheets/kurs/${kod} - Fetching exchange rate for product`);
  
  // Получаем курс из последней приемки для данного товара
  db.get(
    `SELECT pr.aktualny_kurs 
     FROM products p
     JOIN product_receipts pr ON p.receipt_id = pr.id
     WHERE p.kod = ? AND p.receipt_id IS NOT NULL
     ORDER BY pr.id DESC
     LIMIT 1`,
    [kod],
    (err, result) => {
      if (err) {
        console.error('❌ Database error:', err);
        return res.status(500).json({ error: err.message });
      }
      
      const kurs = result && result.aktualny_kurs ? result.aktualny_kurs : 4.25;
      console.log(`✅ Exchange rate for ${kod}: ${kurs}`);
      res.json({ kurs });
    }
  );
});

app.put('/api/working-sheets/update', (req, res) => {
  const { id, kod, nazwa, ilosc, typ, kod_kreskowy, data_waznosci, rezerwacje, objetosc, sprzedawca, cena, cena_sprzedazy, koszt_dostawy_per_unit, podatek_akcyzowy, kurs } = req.body;
  console.log(`📝 PUT /api/working-sheets/update - Updating working sheet:`, { 
    id, 
    kod, 
    nazwa, 
    ilosc, 
    typ 
  });
  
  if (!id) {
    console.log('❌ Validation failed: ID is required');
    return res.status(400).json({ error: 'ID is required' });
  }
  
  // Сначала проверяем, существует ли запись
  db.get('SELECT * FROM working_sheets WHERE id = ?', [id], (err, existingRecord) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!existingRecord) {
      console.log(`❌ Working sheet with ID ${id} not found`);
      return res.status(404).json({ error: 'Working sheet not found' });
    }
    
    console.log(`🔄 Found existing record: ${existingRecord.kod} (current ilosc: ${existingRecord.ilosc})`);
    
    // Получаем тип товара (из запроса или из существующей записи)
    const finalTyp = typ !== undefined ? typ : existingRecord.typ;
    
    // Получаем значения для расчета
    const finalCena = cena !== undefined ? cena : existingRecord.cena;
    let finalKosztDostawyPerUnit = koszt_dostawy_per_unit !== undefined ? koszt_dostawy_per_unit : existingRecord.koszt_dostawy_per_unit;
    let finalPodatekAkcyzowy = podatek_akcyzowy !== undefined ? podatek_akcyzowy : existingRecord.podatek_akcyzowy;
    
    // Для bezalkoholowe, ferment и aksesoria акциз всегда 0
    const isBezalkoholoweOrFermentOrAksesoria = finalTyp === 'bezalkoholowe' || finalTyp === 'ferment' || finalTyp === 'aksesoria';
    if (isBezalkoholoweOrFermentOrAksesoria) {
      finalPodatekAkcyzowy = 0;
      console.log(`🔍 Product type is ${finalTyp}, setting podatek_akcyzowy to 0`);
    }
    
    // Для aksesoria транспорт не распределяется
    if (finalTyp === 'aksesoria') {
      finalKosztDostawyPerUnit = 0;
      console.log(`🔍 Product type is aksesoria, setting koszt_dostawy_per_unit to 0`);
    }
    
    // Используем переданный курс из формы или пытаемся получить из связанного receipt'а
    const productKod = kod || existingRecord.kod;
    
    // Если курс передан из формы, используем его напрямую
    if (kurs !== undefined) {
      const finalKursValue = parseFloat(kurs) || 4.25;
      console.log(`💰 Kurs from form: ${finalKursValue}`);
      
      // Рассчитываем koszt_wlasny: cena * kurs + koszt_dostawy_per_unit + podatek_akcyzowy
      const kosztWlasny = parseFloat((finalCena * finalKursValue + finalKosztDostawyPerUnit + finalPodatekAkcyzowy).toFixed(2));
      console.log(`📊 Calculated koszt_wlasny: ${finalCena} * ${finalKursValue} + ${finalKosztDostawyPerUnit} + ${finalPodatekAkcyzowy} = ${kosztWlasny}`);
    
    // Обновляем запись
    db.run(
          'UPDATE working_sheets SET kod = ?, nazwa = ?, ilosc = ?, typ = ?, kod_kreskowy = ?, data_waznosci = ?, rezerwacje = ?, objetosc = ?, sprzedawca = ?, cena = ?, cena_sprzedazy = ?, koszt_dostawy_per_unit = ?, podatek_akcyzowy = ?, koszt_wlasny = ? WHERE id = ?',
      [
        kod || existingRecord.kod,
        nazwa || existingRecord.nazwa,
        ilosc || existingRecord.ilosc,
        typ || existingRecord.typ,
        kod_kreskowy || existingRecord.kod_kreskowy,
        data_waznosci || existingRecord.data_waznosci,
        rezerwacje || existingRecord.rezerwacje,
        objetosc || existingRecord.objetosc,
        sprzedawca || existingRecord.sprzedawca,
            finalCena,
            cena_sprzedazy !== undefined ? cena_sprzedazy : existingRecord.cena_sprzedazy,
            finalKosztDostawyPerUnit,
            finalPodatekAkcyzowy,
            kosztWlasny,
        id
      ],
      function(err) {
        if (err) {
          console.error('❌ Database error:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`✅ Working sheet ${id} updated successfully`);
        console.log(`📊 Changes: kod=${kod || existingRecord.kod}, nazwa=${nazwa || existingRecord.nazwa}, ilosc=${ilosc || existingRecord.ilosc}`);
        
        // Если изменилась цена, обновляем её в products для записей с receipt_id = NULL
        const updatedCena = cena || existingRecord.cena;
        if (cena && cena !== existingRecord.cena) {
          const productKod = kod || existingRecord.kod;
          console.log(`💰 Price changed for ${productKod}: ${existingRecord.cena} → ${cena}`);
          console.log(`🔄 Updating price in products table for records with receipt_id = NULL`);
          
          db.run(
            'UPDATE products SET cena = ? WHERE kod = ? AND receipt_id IS NULL',
            [cena, productKod],
            function(updateErr) {
              if (updateErr) {
                console.error(`❌ Error updating products table:`, updateErr);
              } else if (this.changes > 0) {
                console.log(`✅ Updated ${this.changes} record(s) in products table`);
              } else {
                console.log(`ℹ️ No records with receipt_id = NULL found in products for ${productKod}`);
              }
            }
          );
        }
        
        res.json({ 
          message: 'Working sheet updated successfully',
          id: id,
          changes: {
            kod: kod || existingRecord.kod,
            nazwa: nazwa || existingRecord.nazwa,
            ilosc: ilosc || existingRecord.ilosc,
            typ: typ || existingRecord.typ
          }
        });
      }
    );
    } else {
      // Если курс не передан, пытаемся получить из связанного receipt'а
      db.get(
        `SELECT pr.aktualny_kurs 
         FROM products p
         JOIN product_receipts pr ON p.receipt_id = pr.id
         WHERE p.kod = ? AND p.receipt_id IS NOT NULL
         ORDER BY pr.id DESC
         LIMIT 1`,
        [productKod],
        (kursErr, kursResult) => {
          const kursValue = kursResult && kursResult.aktualny_kurs ? kursResult.aktualny_kurs : 4.25;
          console.log(`💰 Kurs from database: ${kursValue}`);
          
          // Рассчитываем koszt_wlasny: cena * kurs + koszt_dostawy_per_unit + podatek_akcyzowy
          const kosztWlasny = parseFloat((finalCena * kursValue + finalKosztDostawyPerUnit + finalPodatekAkcyzowy).toFixed(2));
          console.log(`📊 Calculated koszt_wlasny: ${finalCena} * ${kursValue} + ${finalKosztDostawyPerUnit} + ${finalPodatekAkcyzowy} = ${kosztWlasny}`);
          
          // Обновляем запись
          db.run(
            'UPDATE working_sheets SET kod = ?, nazwa = ?, ilosc = ?, typ = ?, kod_kreskowy = ?, data_waznosci = ?, rezerwacje = ?, objetosc = ?, sprzedawca = ?, cena = ?, cena_sprzedazy = ?, koszt_dostawy_per_unit = ?, podatek_akcyzowy = ?, koszt_wlasny = ? WHERE id = ?',
            [
              kod || existingRecord.kod,
              nazwa || existingRecord.nazwa,
              ilosc || existingRecord.ilosc,
              typ || existingRecord.typ,
              kod_kreskowy || existingRecord.kod_kreskowy,
              data_waznosci || existingRecord.data_waznosci,
              rezerwacje || existingRecord.rezerwacje,
              objetosc || existingRecord.objetosc,
              sprzedawca || existingRecord.sprzedawca,
              finalCena,
              cena_sprzedazy !== undefined ? cena_sprzedazy : existingRecord.cena_sprzedazy,
              finalKosztDostawyPerUnit,
              finalPodatekAkcyzowy,
              kosztWlasny,
              id
            ],
            function(err) {
              if (err) {
                console.error('❌ Database error:', err);
                res.status(500).json({ error: err.message });
                return;
              }
              
              console.log(`✅ Working sheet ${id} updated successfully`);
              console.log(`📊 Changes: kod=${kod || existingRecord.kod}, nazwa=${nazwa || existingRecord.nazwa}, ilosc=${ilosc || existingRecord.ilosc}`);
              
              // Если изменилась цена, обновляем её в products для записей с receipt_id = NULL
              const updatedCena = cena || existingRecord.cena;
              if (cena && cena !== existingRecord.cena) {
                const productKod = kod || existingRecord.kod;
                console.log(`💰 Price changed for ${productKod}: ${existingRecord.cena} → ${cena}`);
                console.log(`🔄 Updating price in products table for records with receipt_id = NULL`);
                
                db.run(
                  'UPDATE products SET cena = ? WHERE kod = ? AND receipt_id IS NULL',
                  [cena, productKod],
                  function(updateErr) {
                    if (updateErr) {
                      console.error(`❌ Error updating products table:`, updateErr);
                    } else if (this.changes > 0) {
                      console.log(`✅ Updated ${this.changes} record(s) in products table`);
                    } else {
                      console.log(`ℹ️ No records with receipt_id = NULL found in products for ${productKod}`);
                    }
                  }
                );
              }
              
              res.json({ 
                message: 'Working sheet updated successfully',
                id: id,
                changes: {
                  kod: kod || existingRecord.kod,
                  nazwa: nazwa || existingRecord.nazwa,
                  ilosc: ilosc || existingRecord.ilosc,
                  typ: typ || existingRecord.typ
                }
              });
            }
          );
        }
      );
    }
  });
});

// Добавляем новый endpoint для обновления количества товара
app.patch('/api/working-sheets/:id/quantity', (req, res) => {
  const { id } = req.params;
  const { ilosc, operation = 'set' } = req.body; // operation: 'set', 'add', 'subtract'
  console.log(`📝 PATCH /api/working-sheets/${id}/quantity - Updating quantity:`, { ilosc, operation });
  
  if (!ilosc && ilosc !== 0) {
    console.log('❌ Validation failed: ilosc is required');
    return res.status(400).json({ error: 'ilosc is required' });
  }
  
  // Сначала получаем текущую запись
  db.get('SELECT * FROM working_sheets WHERE id = ?', [id], (err, existingRecord) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!existingRecord) {
      console.log(`❌ Working sheet with ID ${id} not found`);
      return res.status(404).json({ error: 'Working sheet not found' });
    }
    
    console.log(`🔄 Found existing record: ${existingRecord.kod} (current ilosc: ${existingRecord.ilosc})`);
    
    // Вычисляем новое количество
    let newQuantity;
    switch (operation) {
      case 'add':
        newQuantity = existingRecord.ilosc + ilosc;
        console.log(`➕ Adding ${ilosc} to current quantity ${existingRecord.ilosc} = ${newQuantity}`);
        break;
      case 'subtract':
        newQuantity = existingRecord.ilosc - ilosc;
        console.log(`➖ Subtracting ${ilosc} from current quantity ${existingRecord.ilosc} = ${newQuantity}`);
        break;
      case 'set':
      default:
        newQuantity = ilosc;
        console.log(`🔄 Setting quantity from ${existingRecord.ilosc} to ${newQuantity}`);
        break;
    }
    
    // Проверяем, что количество не отрицательное
    if (newQuantity < 0) {
      console.log(`❌ Invalid quantity: ${newQuantity} (cannot be negative)`);
      return res.status(400).json({ error: 'Quantity cannot be negative' });
    }
    
    // Обновляем количество
    db.run(
      'UPDATE working_sheets SET ilosc = ? WHERE id = ?',
      [newQuantity, id],
      function(err) {
        if (err) {
          console.error('❌ Database error:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`✅ Working sheet ${id} quantity updated: ${existingRecord.ilosc} → ${newQuantity}`);
        
        res.json({ 
          message: 'Working sheet quantity updated successfully',
          id: id,
          kod: existingRecord.kod,
          oldQuantity: existingRecord.ilosc,
          newQuantity: newQuantity,
          operation: operation
        });
      }
    );
  });
});

// Добавляем endpoint для массового обновления working_sheets
app.post('/api/working-sheets/bulk-update', (req, res) => {
  const { updates } = req.body; // массив объектов { id, ilosc, nazwa, typ, etc. }
  console.log(`📝 POST /api/working-sheets/bulk-update - Bulk updating ${updates?.length || 0} records`);
  
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    console.log('❌ Validation failed: updates array is required');
    return res.status(400).json({ error: 'updates array is required' });
  }
  
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  const results = [];
  
  updates.forEach((update, index) => {
    console.log(`🔄 Processing update ${index + 1}/${updates.length}:`, update);
    
    if (!update.id) {
      console.log(`❌ Update ${index + 1} failed: ID is required`);
      errorCount++;
      results.push({ id: update.id, success: false, error: 'ID is required' });
      processedCount++;
      checkCompletion();
      return;
    }
    
    // Обновляем запись
    const updateFields = [];
    const updateValues = [];
    
    if (update.ilosc !== undefined) {
      updateFields.push('ilosc = ?');
      updateValues.push(update.ilosc);
    }
    if (update.nazwa !== undefined) {
      updateFields.push('nazwa = ?');
      updateValues.push(update.nazwa);
    }
    if (update.typ !== undefined) {
      updateFields.push('typ = ?');
      updateValues.push(update.typ);
    }
    if (update.kod_kreskowy !== undefined) {
      updateFields.push('kod_kreskowy = ?');
      updateValues.push(update.kod_kreskowy);
    }
    if (update.data_waznosci !== undefined) {
      updateFields.push('data_waznosci = ?');
      updateValues.push(update.data_waznosci);
    }
    if (update.rezerwacje !== undefined) {
      updateFields.push('rezerwacje = ?');
      updateValues.push(update.rezerwacje);
    }
    if (update.objetosc !== undefined) {
      updateFields.push('objetosc = ?');
      updateValues.push(update.objetosc);
    }
    if (update.sprzedawca !== undefined) {
      updateFields.push('sprzedawca = ?');
      updateValues.push(update.sprzedawca);
    }
    if (update.cena !== undefined) {
      updateFields.push('cena = ?');
      updateValues.push(update.cena);
    }
    if (update.cena_sprzedazy !== undefined) {
      updateFields.push('cena_sprzedazy = ?');
      updateValues.push(update.cena_sprzedazy);
    }
    
    if (updateFields.length === 0) {
      console.log(`⚠️ Update ${index + 1} skipped: no fields to update`);
      results.push({ id: update.id, success: true, message: 'No fields to update' });
      successCount++;
      processedCount++;
      checkCompletion();
      return;
    }
    
    updateValues.push(update.id);
    
    db.run(
      `UPDATE working_sheets SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues,
      function(err) {
        if (err) {
          console.error(`❌ Error updating working sheet ${update.id}:`, err);
          errorCount++;
          results.push({ id: update.id, success: false, error: err.message });
        } else {
          console.log(`✅ Working sheet ${update.id} updated successfully`);
          successCount++;
          results.push({ id: update.id, success: true, changes: updateFields.length });
        }
        processedCount++;
        checkCompletion();
      }
    );
  });
  
  function checkCompletion() {
    if (processedCount === updates.length) {
      if (res.headersSent) {
        console.log('⚠️ Response already sent, skipping checkCompletion');
        return;
      }
      
      console.log(`🎉 Bulk update complete: ${successCount} successful, ${errorCount} failed`);
      res.json({ 
        message: 'Bulk update completed',
        total: updates.length,
        successful: successCount,
        failed: errorCount,
        results: results
      });
    }
  }
});

// Original Sheets API
app.get('/api/original-sheets', (req, res) => {
  db.all('SELECT * FROM original_sheets ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Преобразуем данные в формат, ожидаемый фронтендом
    const processedRows = rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      data: row.data ? JSON.parse(row.data) : { headers: [], rows: [] },
      created_at: row.created_at
    }));
    
    res.json(processedRows || []);
  });
});

app.post('/api/original-sheets', (req, res) => {
  const { file_name, data } = req.body;
  
  if (!file_name) {
    return res.status(400).json({ error: 'File name is required' });
  }
  
  db.run(
    'INSERT INTO original_sheets (file_name, data) VALUES (?, ?)',
    [file_name, data],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Original sheet added successfully' });
    }
  );
});




// DUPLICATE price-history endpoint - REMOVED


// File Upload API
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalname: req.file.originalname
  });
});

// File Management API
app.get('/api/check_file/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(__dirname, 'uploads', fileName);
  
  if (fs.existsSync(filePath)) {
    res.json({ exists: true, path: filePath });
  } else {
    res.json({ exists: false });
  }
});



// Download file API
app.get('/api/download_file/:fileName', (req, res) => {
  const { fileName } = req.params;
  
  // Ищем файл в базе данных
  db.get('SELECT * FROM original_sheets WHERE file_name = ?', [fileName], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    try {
      const data = JSON.parse(row.data);
      
             // Создаем HTML страницу с таблицей в стиле модального окна
       const htmlContent = `
         <!DOCTYPE html>
         <html>
         <head>
           <meta charset="UTF-8">
           <title>${fileName}</title>
           <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet">
           <style>
             * {
               margin: 0;
               padding: 0;
               box-sizing: border-box;
             }
             
             body { 
               font-family: 'Sora', sans-serif; 
               margin: 0;
               padding: 24px;
               background-color: #f9fafb;
               color: #374151;
               line-height: 1.5;
             }
             
             .container {
               max-width: 1200px;
               margin: 0 auto;
               background: white;
               border-radius: 0.5rem;
               box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
               overflow: hidden;
             }
             
             .header {
               padding: 24px;
               border-bottom: 1px solid #e5e7eb;
               background: white;
             }
             
             .header h1 {
               font-size: 1rem;
               font-weight: 600;
               color: #1f2937;
               margin: 0;
             }
             
             .content {
               padding: 24px;
               overflow-x: auto;
             }
             
             table { 
               border-collapse: collapse; 
               width: 100%; 
               font-size: 0.75rem;
               font-family: 'Sora', sans-serif;
             }
             
             th, td { 
               border: 1px solid #d1d5db; 
               padding: 6px 12px; 
               text-align: left; 
               vertical-align: top;
             }
             
             th { 
               background-color: #f3f4f6; 
               font-weight: 600;
               color: #374151;
               font-size: 0.75rem;
               text-transform: uppercase;
               letter-spacing: 0.05em;
             }
             
             tr:nth-child(even) { 
               background-color: #f9fafb; 
             }
             
             tr:hover {
               background-color: #f3f4f6;
             }
             
             td {
               color: #374151;
               font-size: 0.75rem;
             }
             
             .empty-cell {
               color: #9ca3af;
               font-style: italic;
             }
             
             @media (max-width: 768px) {
               body {
                 padding: 12px;
               }
               
               .container {
                 border-radius: 0.375rem;
               }
               
               .header, .content {
                 padding: 16px;
               }
               
               table {
                 font-size: 0.625rem;
               }
               
               th, td {
                 padding: 4px 8px;
               }
             }
           </style>
         </head>
         <body>
           <div class="container">
             <div class="header">
               <h1>${fileName}</h1>
             </div>
             <div class="content">
               <table>
                 <thead>
                   <tr>
                     ${data.headers.map(header => `<th>${header || ''}</th>`).join('')}
                   </tr>
                 </thead>
                 <tbody>
                   ${data.rows.map(row => 
                     `<tr>${row.map(cell => `<td class="${!cell ? 'empty-cell' : ''}">${cell || ''}</td>`).join('')}</tr>`
                   ).join('')}
                 </tbody>
               </table>
             </div>
           </div>
         </body>
         </html>
       `;
      
      // Отправляем HTML страницу
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error generating HTML:', error);
      res.status(500).json({ error: 'Error generating HTML' });
    }
  });
});

// Sheets API
app.post('/api/sheets', (req, res) => {
  const { fileName, data } = req.body;
  
  if (!fileName) {
    return res.status(400).json({ error: 'File name is required' });
  }
  
  // Проверяем, есть ли уже файл в системе
  db.get('SELECT COUNT(*) as count FROM original_sheets', (err, row) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (row.count > 0) {
      return res.status(409).json({ error: 'Only one Excel file can be uploaded at a time. Please delete the existing file first.' });
    }
    
    // Сохраняем данные в таблицу original_sheets
  db.run(
    'INSERT INTO original_sheets (file_name, data) VALUES (?, ?)',
    [fileName, JSON.stringify(data)],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      const originalSheetId = this.lastID;
      
      // Преобразуем Excel данные в формат working_sheets и сохраняем
      try {
        const { headers, rows } = data;
        
        console.log('=== ПАРСИНГ EXCEL ФАЙЛА ===');
        console.log('fileName:', fileName);
        console.log('headers:', headers);
        console.log('rows count:', rows.length);
        
        // Ищем индексы нужных колонок
        const kodIndex = headers.findIndex(h => 
          h && h.toLowerCase().includes('kod') || 
          h && h.toLowerCase().includes('код') ||
          h && h.toLowerCase().includes('code')
        );
        const nazwaIndex = headers.findIndex(h => 
          h && h.toLowerCase().includes('nazwa') || 
          h && h.toLowerCase().includes('название') ||
          h && h.toLowerCase().includes('name') ||
          h && h.toLowerCase().includes('product')
        );
        const iloscIndex = headers.findIndex(h => 
          h && h.toLowerCase().includes('ilosc') || 
          h && h.toLowerCase().includes('количество') ||
          h && h.toLowerCase().includes('quantity') ||
          h && h.toLowerCase().includes('amount')
        );
        const dataIndex = headers.findIndex(h => 
          h && h.toLowerCase().includes('data') || 
          h && h.toLowerCase().includes('дата') ||
          h && h.toLowerCase().includes('date')
        );
        
        console.log('Найденные индексы:');
        console.log('- kodIndex:', kodIndex, '(поиск: kod, код, code)');
        console.log('- nazwaIndex:', nazwaIndex, '(поиск: nazwa, название, name, product)');
        console.log('- iloscIndex:', iloscIndex, '(поиск: ilosc, количество, quantity, amount)');
        console.log('- dataIndex:', dataIndex, '(поиск: data, дата, date)');
        
        // Если не нашли нужные колонки, используем первые доступные
        const finalKodIndex = kodIndex >= 0 ? kodIndex : 0;
        const finalNazwaIndex = nazwaIndex >= 0 ? nazwaIndex : (kodIndex >= 0 ? 1 : 0);
        const finalIloscIndex = iloscIndex >= 0 ? iloscIndex : (nazwaIndex >= 0 ? 2 : 1);
        const finalDataIndex = dataIndex >= 0 ? dataIndex : (iloscIndex >= 0 ? 3 : 2);
        
        console.log('Финальные индексы:');
        console.log('- finalKodIndex:', finalKodIndex);
        console.log('- finalNazwaIndex:', finalNazwaIndex);
        console.log('- finalIloscIndex:', finalIloscIndex);
        console.log('- finalDataIndex:', finalDataIndex);
        
        // Получаем текущую дату для записей без даты
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Подготавливаем данные для вставки в working_sheets
        const workingSheetData = rows.map((row, index) => {
          // Функция для проверки пустых значений
          const getValueOrNull = (value) => {
            if (value === undefined || value === null || value === '' || value === 'undefined' || value === 'null') {
              return null;
            }
            return value.toString().trim();
          };
          
          const getNumberOrNull = (value) => {
            if (value === undefined || value === null || value === '' || value === 'undefined' || value === 'null') {
              return null;
            }
            const num = parseInt(value);
            return isNaN(num) ? null : num;
          };
          
          const kod = getValueOrNull(row[finalKodIndex]);
          const nazwa = getValueOrNull(row[finalNazwaIndex]);
          const ilosc = getNumberOrNull(row[finalIloscIndex]);
          
          // Ищем только kod_kreskowy в заголовках
          const kodKreskowyIndex = headers.findIndex(h => 
            h && h.toLowerCase().includes('kreskowy') || 
            h && h.toLowerCase().includes('штрих') ||
            h && h.toLowerCase().includes('barcode')
          );
          
          return {
            kod: kod,
            nazwa: nazwa,
            ilosc: ilosc,
            typ: null, // не копируем из Excel
            kod_kreskowy: kodKreskowyIndex >= 0 ? getValueOrNull(row[kodKreskowyIndex]) : null,
            data_waznosci: null, // не копируем из Excel
            rezerwacje: null, // не копируем из Excel
            objetosc: null, // не копируем из Excel
            sprzedawca: null // не копируем из Excel
          };
        });
        
        console.log('Обработано строк:', workingSheetData.length);
        
        // Фильтруем пустые записи
        const filteredData = workingSheetData.filter(item => item.kod && item.nazwa && item.ilosc && item.ilosc > 0);
        
        console.log('После фильтрации:', filteredData.length, 'строк');
        console.log('Отфильтровано:', workingSheetData.length - filteredData.length, 'строк');
        
        // Показываем причины фильтрации
        const filteredOut = workingSheetData.filter(item => !item.kod || !item.nazwa || !item.ilosc || item.ilosc <= 0);
        if (filteredOut.length > 0) {
          console.log('Причины фильтрации:');
          filteredOut.forEach((item, index) => {
            const reasons = [];
            if (!item.kod) reasons.push('пустой код');
            if (!item.nazwa) reasons.push('пустое название');
            if (!item.ilosc || item.ilosc <= 0) reasons.push('количество <= 0 или null');
            console.log(`- Строка ${index + 1}: ${reasons.join(', ')}`);
          });
        }
        
        // Вставляем данные в working_sheets
        if (filteredData.length > 0) {
          const placeholders = filteredData.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const values = filteredData.flatMap(item => [
            item.kod, item.nazwa, item.ilosc, item.kod_kreskowy, item.data_waznosci, 
            item.rezerwacje, item.objetosc, item.typ, item.sprzedawca, // sprzedawca
            null, // cena (по умолчанию null)
            null, // cena_sprzedazy (по умолчанию null)
            null // produkt_id
          ]);
          
          db.run(
            `INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, data_waznosci, rezerwacje, objetosc, typ, sprzedawca, cena, cena_sprzedazy, produkt_id) VALUES ${placeholders}`,
            values,
            function(err) {
              if (err) {
                console.error('Error inserting into working_sheets:', err);
                // Не возвращаем ошибку, так как original_sheets уже сохранен
              } else {
                console.log(`✅ Copied ${filteredData.length} records from original_sheets to working_sheets`);
              }
            }
          );
        }
        
      } catch (error) {
        console.error('Error processing data for working_sheets:', error);
        // Не возвращаем ошибку, так как original_sheets уже сохранен
      }
      
      res.json({ 
        id: originalSheetId, 
        message: 'Sheet data saved successfully and copied to working sheets',
        fileName: fileName
      });
    }
  );
});







}); // Закрываем блок db.serialize

// Test endpoints - только для разработки и тестирования
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  try {
    const { setupTestEndpoints } = require('./test-endpoints');
    setupTestEndpoints(app, db);
    console.log('🧪 Test endpoints enabled for development/test environment');
  } catch (error) {
    console.log('⚠️ Could not load test endpoints:', error.message);
  }
} else {
  console.log('🚀 Production mode - test endpoints disabled');
}

// Serve static files from parent directory (frontend)
// В dev режиме фронт работает на Vite (порт 3000), поэтому сервер на 3001 не должен обслуживать статику
// В production режиме обслуживаем статические файлы из dist
// ВАЖНО: В dev режиме (когда фронт на Vite) НЕ обслуживаем статику, чтобы не перехватывать API запросы
const isProduction = process.env.NODE_ENV === 'production';
console.log(`🔧 Server mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

if (isProduction) {
  // Явно исключаем /api из статических файлов
  app.use((req, res, next) => {
    // КРИТИЧЕСКИ ВАЖНО: Пропускаем все API запросы - они должны обрабатываться роутами выше
    if (req.path.startsWith('/api/')) {
      console.log(`🔵 API request bypassing static middleware: ${req.method} ${req.path}`);
      return next();
    }
    // Для остальных запросов обслуживаем статические файлы
    console.log(`📁 Static file request: ${req.method} ${req.path}`);
    express.static(path.join(__dirname, '../dist'))(req, res, next);
  });

// ВАЖНО: SPA Fallback маршрут ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ!
  // Но он не должен перехватывать API запросы
app.get('*', (req, res) => {
    // Если это API запрос, возвращаем 404
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    const indexPath = path.join(__dirname, '../dist/index.html');
  console.log('Serving SPA fallback:', indexPath);
  res.sendFile(indexPath);
});
} else {
  // В dev режиме только API, статические файлы не обслуживаем (они на Vite на порту 3000)
  console.log('🔧 Development mode: static files served by Vite on port 3000');
  console.log('🔧 API requests will be handled by routes above, no static middleware');
  // НЕ добавляем никаких middleware для статических файлов в dev режиме
  // API роуты обрабатываются выше, а для несуществующих API endpoints Express вернет 404 автоматически
}

// Migration endpoint (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/migrate/add-working-sheets-history', (req, res) => {
    console.log('🔄 Starting migration: Add working_sheets_history table...');
    
    const createHistoryTable = `
      CREATE TABLE IF NOT EXISTS working_sheets_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kod TEXT NOT NULL,
        nazwa TEXT,
        ilosc INTEGER,
        kod_kreskowy TEXT,
        typ TEXT,
        sprzedawca TEXT,
        cena REAL,
        data_waznosci TEXT,
        objetosc REAL,
        koszt_dostawy_per_unit REAL DEFAULT 0,
        podatek_akcyzowy REAL DEFAULT 0,
        koszt_wlasny REAL DEFAULT 0,
        action TEXT NOT NULL,
        receipt_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (receipt_id) REFERENCES product_receipts (id)
      );
    `;
    
    db.run(createHistoryTable, (err) => {
      if (err) {
        console.error('❌ Error creating working_sheets_history table:', err.message);
        return res.status(500).json({ error: err.message });
      }
      
      // Создаем индексы
      const createIndexes = `
        CREATE INDEX IF NOT EXISTS idx_working_sheets_history_kod ON working_sheets_history(kod);
        CREATE INDEX IF NOT EXISTS idx_working_sheets_history_receipt_id ON working_sheets_history(receipt_id);
        CREATE INDEX IF NOT EXISTS idx_working_sheets_history_action ON working_sheets_history(action);
      `;
      
      db.run(createIndexes, (err) => {
        if (err) {
          console.error('❌ Error creating indexes:', err.message);
          return res.status(500).json({ error: err.message });
        }
        
        console.log('✅ Migration completed successfully!');
        res.json({ message: 'Migration completed successfully' });
      });
    });
  });
}

// WMS Integration API
const WMS_BASE_URLS = [
  'http://wms.veis.pl',           // Основной адрес
  'http://wms.veis.pl:8080',      // Альтернативный порт
  'http://wms.veis.pl:5000',      // Другой порт
  'http://api.wms.veis.pl',       // API поддомен
  'http://dataconnect.wms.veis.pl' // DataConnect поддомен
];
const WMS_API_URL = WMS_BASE_URLS[0]; // Используем первый по умолчанию
const WMS_LOGIN = 'enoterra';
const WMS_PASSWORD = 'enoterra';
const WMS_COMPANY_ID = 'enoterra';

// Возможные пути к API (попробуем по очереди)
const POSSIBLE_API_PATHS = [
  '/authorize',                           // Базовый путь из документации
  '/api/authorize',                       // С префиксом /api
  '/api/auth',                            // Сокращённое
  '/api/login',                           // Альтернативное название
  '/dataconnect/authorize',               // DataConnect модуль
  '/dataconnect/api/authorize',           // DataConnect с /api
  '/dc/authorize',                        // Сокращённое название
  '/integration/authorize',               // Интеграция
  '/integration/api/authorize',           // Интеграция с /api
  '/external/authorize',                  // Внешний API
  '/rest/authorize',                      // REST API
  '/rest/api/authorize',                  // REST с /api
  '/webapi/authorize',                    // Web API
  '/services/authorize',                  // Сервисы
  '/ws/authorize',                        // Web Service
  '/api/v6/authorize',                    // С версией
  '/api/v6.0.0/authorize',                // Полная версия
  '/v6/authorize',                        // Только версия
  '/company/enoterra/authorize',          // С companyId в пути
  '/enoterra/authorize',                  // Только companyId
  '/ExpertWMS/api/authorize',             // С названием продукта
  '/expertwms/api/authorize',             // Lowercase
  '/DC.Expert/api/authorize',             // Полное название
  '/DataConnect/authorize',               // С большой буквы
  '/Authorize',                           // С большой буквы
  '/API/Authorize'                        // Всё с большой буквы
];

// Авторизация в WMS (пробуем разные пути)
async function authenticateWMS() {
  const FormData = require('form-data');
  const fetch = require('node-fetch');
  
  // Пробуем разные комбинации параметров
  const paramVariants = [
    { username: 'Username', password: 'Password' },       // Из документации
    { username: 'username', password: 'password' },       // Lowercase
    { username: 'login', password: 'password' },          // Альтернативное название
    { username: 'user', password: 'pass' }                // Сокращённое
  ];

  // Пробуем разные пути к API
  for (const apiPath of POSSIBLE_API_PATHS) {
    for (const params of paramVariants) {
      try {
        const formData = new FormData();
        formData.append(params.username, WMS_LOGIN);
        formData.append(params.password, WMS_PASSWORD);

        const url = `${WMS_API_URL}${apiPath}`;
        console.log(`🔐 Попытка: ${url} с параметрами ${params.username}/${params.password}`);
        
        const response = await fetch(url, {
          method: 'POST',
          body: formData
        });

        console.log(`📡 Ответ (${apiPath}):`, response.status);

        const responseText = await response.text();
        
        // Если 404, пробуем следующий путь
        if (response.status === 404) {
          continue;
        }

        if (!response.ok) {
          console.log(`❌ ${response.status} на ${apiPath}`);
          continue;
        }

        console.log('📄 Тело ответа:', responseText.substring(0, 200));

        const data = JSON.parse(responseText);
        console.log('✅ Данные авторизации:', data);
        
        const token = data.token || data.access_token || data.Token || data.AccessToken || null;
        
        if (token) {
          console.log(`✅ Успешная авторизация: ${url} с ${params.username}/${params.password}`);
          return token;
        }
      } catch (error) {
        // Продолжаем пробовать другие варианты
      }
    }
  }
  
  throw new Error('Не удалось авторизоваться ни по одному из путей API');
}

// Отправка заявки в WMS
app.post('/api/wms/send-shipment', async (req, res) => {
  try {
    const { orderId } = req.body;
    
    console.log('📦 Запрос на отправку заявки в WMS, orderId:', orderId);

    // Получаем данные заявки из БД
    db.get('SELECT * FROM orders WHERE id = ?', [orderId], async (err, order) => {
      if (err) {
        console.error('❌ Ошибка БД:', err);
        return res.status(500).json({ error: 'Ошибка получения заявки из БД' });
      }

      if (!order) {
        return res.status(404).json({ error: 'Заявка не найдена' });
      }

      try {
        // Шаг 1: Авторизация
        const token = await authenticateWMS();
        if (!token) {
          throw new Error('Не удалось получить токен авторизации');
        }

        // Шаг 2: Подготовка данных
        const shipmentData = {
          type: 'PWM-K',
          state: 1,
          status: 0,
          activeDate: order.data_utworzenia || new Date().toISOString(),
          items: []
        };

        console.log('📤 Отправка заявки в WMS:', shipmentData);

        // Шаг 3: Отправка заявки
        const fetch = require('node-fetch');
        const response = await fetch(`${WMS_API_URL}/company/${WMS_COMPANY_ID}/shipments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(shipmentData)
        });

        const responseText = await response.text();
        console.log('📡 Ответ WMS shipments:', response.status, responseText);

        if (!response.ok) {
          throw new Error(`WMS вернул ошибку: ${response.status} - ${responseText}`);
        }

        const result = JSON.parse(responseText);
        console.log('✅ Заявка успешно отправлена в WMS:', result);

        res.json({ 
          success: true, 
          wmsShipmentId: result.id,
          message: 'Заявка успешно отправлена в WMS'
        });
      } catch (error) {
        console.error('❌ Ошибка отправки в WMS:', error);
        res.status(500).json({ 
          error: error.message || 'Ошибка отправки в WMS' 
        });
      }
    });
  } catch (error) {
    console.error('❌ Ошибка обработки запроса:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 EnoTerra ERP Server running on port ${PORT}`);
  console.log(`📂 Serving static files from: ${__dirname}`);
  console.log(`💾 Database located at: ${dbPath}`);
  console.log(`✅ All routes registered, including POST /api/reservations`);
});

// ===== NEW CONSUME FROM PRODUCTS (FIFO) =====
function consumeFromProducts(productKod, quantity) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM products WHERE kod = ? AND ilosc_aktualna > 0 ORDER BY created_at ASC, id ASC',
      [productKod],
      (err, batches) => {
        if (err) return reject(err);
        if (batches.length === 0) return resolve({ consumed: 0, remaining: quantity, consumptions: [] });

        let remaining = quantity;
        const consumptions = [];

        const next = () => {
          if (remaining <= 0 || batches.length === 0) {
            return resolve({ consumed: quantity - remaining, remaining, consumptions });
          }

          const batch = batches.shift();
          const take = Math.min(batch.ilosc_aktualna, remaining);
          const newLeft = batch.ilosc_aktualna - take;

          db.run('UPDATE products SET ilosc_aktualna = ? WHERE id = ?', [newLeft, batch.id], function (upErr) {
            if (upErr) return reject(upErr);
            consumptions.push({ batchId: batch.id, qty: take, cena: batch.cena || 0 });
            remaining -= take;
            next();
          });
        };
        next();
      }
    );
  });
}

// === Test endpoint ===
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test-consume', (req, res) => {
    const { kod, quantity } = req.body;
    consumeFromProducts(kod, quantity)
      .then(r => res.json(r))
      .catch(e => {
        console.error(e);
        res.status(500).json({ error: e.message });
      });
  });
}

// Helper: restore quantity back to newest batch
const restoreToProducts = (productKod, quantity) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM products WHERE kod = ? ORDER BY created_at DESC, id DESC LIMIT 1',
      [productKod],
      (err, batch) => {
        if (err) return reject(err);
        if (!batch) return resolve({ restored: 0 });

        const newQty = (batch.ilosc_aktualna || 0) + quantity;
        db.run(
          'UPDATE products SET ilosc_aktualna = ? WHERE id = ?',
          [newQty, batch.id],
          upErr => (upErr ? reject(upErr) : resolve({ restored: quantity, batchId: batch.id }))
        );
      }
    );
  });
};

// Serve static files from parent directory (frontend)
app.use(express.static(path.join(__dirname, '..')));

// ВАЖНО: SPA Fallback маршрут ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ!
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../index.html');
  console.log('Serving SPA fallback:', indexPath);
  res.sendFile(indexPath);
});

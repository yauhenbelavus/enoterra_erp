import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    cb(null, Date.now() + '-' + safeName);
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

// Database initialization
db.serialize(() => {
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
    kod TEXT UNIQUE NOT NULL,
    nazwa TEXT NOT NULL,
    kod_kreskowy TEXT,
    cena REAL DEFAULT 0,
    cena_sprzedazy REAL DEFAULT 0,
    ilosc INTEGER DEFAULT 0,
    data_waznosci DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    FOREIGN KEY (orderId) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating order_products table:', err);
    } else {
      console.log('✅ Order products table ready');
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

  // Таблица истории цен
  db.run(`CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    kod TEXT NOT NULL,
    nazwa TEXT NOT NULL,
    cena REAL NOT NULL,
    data_zmiany DATE NOT NULL,
    ilosc_fixed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating price_history table:', err);
    } else {
      console.log('✅ Price history table ready');
    }
  });

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

  console.log('🎉 All database tables initialized successfully');
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
    'INSERT INTO products (kod, nazwa, kod_kreskowy, cena, cena_sprzedazy, ilosc, data_waznosci) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [kod, nazwa, kod_kreskowy, cena || 0, cena_sprzedazy || 0, ilosc || 0, data_waznosci],
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
      res.json(rows || []);
    }
  );
});

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
      db.all('SELECT * FROM order_products WHERE orderId = ? ORDER BY created_at', [order.id], (err, productRows) => {
        if (err) {
          console.error(`❌ Error fetching products for order ${order.id}:`, err);
          // Добавляем заказ без продуктов в случае ошибки
          ordersWithProducts.push({
            ...order,
            products: []
          });
        } else {
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
      db.all('SELECT * FROM order_products WHERE orderId = ? ORDER BY created_at', [order.id], (err, productRows) => {
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
    db.all('SELECT * FROM order_products WHERE orderId = ? ORDER BY created_at', [id], (err, productRows) => {
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
  
  // Проверяем доступность товаров перед созданием заказа
  console.log('🔍 Checking product availability...');
  
  // Создаем массив для проверки доступности
  const availabilityChecks = products.map(product => {
    return new Promise((resolve, reject) => {
      const { kod, nazwa, ilosc } = product;
      
      db.get('SELECT ilosc as available FROM working_sheets WHERE kod = ?', [kod], (err, row) => {
        if (err) {
          reject({ kod, error: err.message });
        } else if (!row) {
          reject({ kod, nazwa, ilosc, available: 0, error: 'Product not found in working_sheets' });
        } else if (row.available < ilosc) {
          reject({ kod, nazwa, ilosc, available: row.available, error: 'Insufficient quantity' });
        } else {
          resolve({ kod, nazwa, ilosc, available: row.available });
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
            
            // Сначала создаем запись в order_products
            db.run(
              'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ, kod_kreskowy, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
              [orderId, kod, nazwa, ilosc, typ || 'sztuki', kod_kreskowy || null],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating product ${index + 1}:`, err);
                  productsFailed++;
                  checkCompletion();
                } else {
                  productsCreated++;
                  console.log(`✅ Product ${index + 1} created for order ${orderId}`);
                  
                  // Теперь обновляем количество в working_sheets И в price_history (FIFO)
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
                        
                        // Теперь списываем по FIFO из price_history с отслеживанием
                        consumeFromPriceHistory(kod, ilosc, orderId)
                          .then((result) => {
                            console.log(`🎯 FIFO consumption for ${kod}: ${result.consumed} szt. consumed`);
                      checkCompletion();
                          })
                          .catch((fifoError) => {
                            console.error(`❌ FIFO consumption error for ${kod}:`, fifoError);
                            // Даже если FIFO не сработал, заказ создан
                            checkCompletion();
                          });
                      }
                    }
                  );
                }
              }
            );
          });
          
          function checkCompletion() {
            if (productsCreated + productsFailed === products.length) {
              if (productsFailed === 0) {
                console.log(`✅ All ${productsCreated} products created successfully for order ${orderId}`);
                console.log(`📊 Working sheets updated: ${workingSheetsUpdated} products`);
                res.json({ 
                  id: orderId, 
                  message: 'Order and all products added successfully',
                  productsCreated: productsCreated,
                  workingSheetsUpdated: workingSheetsUpdated
                });
              } else {
                console.log(`⚠️ Order created but ${productsFailed} products failed to create`);
                res.json({ 
                  id: orderId, 
                  message: `Order created but ${productsFailed} products failed to create`,
                  productsCreated: productsCreated,
                  productsFailed: productsFailed,
                  workingSheetsUpdated: workingSheetsUpdated
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
      
      const { kod, nazwa, ilosc, available, error } = errors;
      
      if (error === 'Insufficient quantity') {
        console.log(`❌ Insufficient quantity for product ${kod} (${nazwa}): requested ${ilosc}, available ${available}`);
        res.status(400).json({ 
          error: 'Insufficient product quantity',
          details: {
            kod,
            nazwa,
            requested: ilosc,
            available: available,
            message: `Недостаточно товара "${nazwa}" (код: ${kod}). Запрошено: ${ilosc}, доступно: ${available}`
          }
        });
      } else if (error === 'Product not found in working_sheets') {
        console.log(`❌ Product ${kod} (${nazwa}) not found in working_sheets`);
        res.status(400).json({ 
          error: 'Product not found',
          details: {
            kod,
            nazwa,
            message: `Товар "${nazwa}" (код: ${kod}) не найден в системе`
          }
        });
      } else {
        console.log(`❌ Database error checking availability for product ${kod}:`, error);
        res.status(500).json({ 
          error: 'Database error during availability check',
          details: {
            kod,
            message: `Ошибка базы данных при проверке доступности товара ${kod}`
          }
        });
      }
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
        
        // Восстанавливаем количество в price_history
                db.run(
          'UPDATE price_history SET ilosc_fixed = ilosc_fixed + ? WHERE id = ?',
          [quantityToRestore, consumption.batch_id],
          function(err) {
            if (err) {
              console.error(`❌ Error restoring quantity in price_history ${consumption.batch_id}:`, err);
                    } else {
              console.log(`✅ Restored ${quantityToRestore} units in price_history ${consumption.batch_id}`);
            }
            
            consumptionsProcessed++;
            checkProductCompletion();
          }
        );
        
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

app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const { klient, numer_zamowienia, products } = req.body;
  console.log(`📋 PUT /api/orders/${id} - Updating order:`, { klient, numer_zamowienia, productsCount: products?.length || 0 });
  
  if (!klient || !numer_zamowienia) {
    console.log('❌ Validation failed: klient and numer_zamowienia are required');
    return res.status(400).json({ error: 'Client name and order number are required' });
  }
  
  // Сначала получаем старые продукты заказа для восстановления количества в working_sheets
  db.all('SELECT * FROM order_products WHERE orderId = ?', [id], (err, oldOrderProducts) => {
    if (err) {
      console.error('❌ Database error fetching old order products:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`🔄 Found ${oldOrderProducts.length} old products to restore in working_sheets`);
    
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
        
        // Удаляем старые продукты заказа
        db.run('DELETE FROM order_products WHERE orderId = ?', [id], function(deleteErr) {
          if (deleteErr) {
            console.error('❌ Database error deleting old order products:', deleteErr);
            res.status(500).json({ error: deleteErr.message });
            return;
          }
          
          console.log(`🗑️ Old order products deleted for order ${id}`);
          
          // Теперь обрабатываем изменения в количествах напрямую
          processQuantityChanges(oldOrderProducts);
        });
      }
    );
  });
  
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
    
    // Создаем map старых продуктов для быстрого поиска
    const oldProductsMap = {};
    oldOrderProducts.forEach(product => {
      oldProductsMap[product.kod] = product;
    });
    
    // Анализируем изменения для каждого продукта
    let productsProcessed = 0;
    let totalProducts = products.length;
          
          products.forEach((product, index) => {
            const { kod, nazwa, ilosc, typ, kod_kreskowy } = product;
            const oldProduct = oldProductsMap[kod];
      const oldQuantity = oldProduct ? oldProduct.ilosc : 0;
      const quantityDiff = ilosc - oldQuantity;
      
      console.log(`📊 Product ${kod}: was ${oldQuantity}, now ${ilosc}, diff: ${quantityDiff > 0 ? '+' : ''}${quantityDiff}`);
            
            // Создаем запись в order_products
            db.run(
              'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ, kod_kreskowy, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
              [id, kod, nazwa, ilosc, typ || 'sztuki', kod_kreskowy || null],
              function(err) {
                if (err) {
                  console.error(`❌ Error creating new product ${index + 1}:`, err);
            productsProcessed++;
                  checkCompletion();
                } else {
                  console.log(`✅ New product ${index + 1} created for order ${id}`);
                  
            // Обрабатываем изменения в количестве
            if (quantityDiff !== 0) {
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
              // Количество не изменилось - ничего не делаем
              console.log(`➡️ Product ${kod}: quantity unchanged, no updates needed`);
              productsProcessed++;
              checkCompletion();
            }
          }
        }
      );
    });
    
    function checkCompletion() {
      if (productsProcessed === totalProducts) {
        console.log(`✅ Order update complete: ${totalProducts} products processed`);
        res.json({ 
          message: 'Order updated successfully with smart FIFO updates',
          productsProcessed: totalProducts
        });
      }
    }
  }
  
  // Функция для обработки увеличения количества продукта
  function processQuantityIncrease(productKod, quantityDiff, callback) {
    console.log(`🔄 Processing quantity increase for ${productKod}: +${quantityDiff}`);
    
    // Проверяем доступность товара
    db.get('SELECT ilosc FROM working_sheets WHERE kod = ?', [productKod], (err, row) => {
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
      
      const availableQuantity = row.ilosc;
      if (availableQuantity < quantityDiff) {
        console.error(`❌ Insufficient quantity for ${productKod}: need ${quantityDiff}, available ${availableQuantity}`);
        callback();
        return;
      }
      
      // Товар доступен, списываем разницу по FIFO
      console.log(`🎯 FIFO consumption for ${productKod}: ${quantityDiff} szt.`);
      consumeFromPriceHistory(productKod, quantityDiff, id)
        .then((result) => {
          console.log(`✅ FIFO consumption complete for ${productKod}: ${result.consumed} szt. consumed`);
          
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
        })
        .catch((fifoError) => {
          console.error(`❌ FIFO consumption error for ${productKod}:`, fifoError);
          callback();
        });
    });
  }
  
  // Функция для обработки уменьшения количества продукта
  function processQuantityDecrease(productKod, quantityDiff, callback) {
    console.log(`🔄 Processing quantity decrease for ${productKod}: -${quantityDiff}`);
    
    // Получаем существующие записи в order_consumptions для этого продукта
    db.all('SELECT * FROM order_consumptions WHERE order_id = ? AND product_kod = ? ORDER BY batch_id ASC', [id, productKod], (err, consumptions) => {
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
      
      // Восстанавливаем количество в price_history и уменьшаем/удаляем записи в order_consumptions
      let remainingToRestore = quantityDiff;
      let consumptionsProcessed = 0;
      
      consumptions.forEach((consumption) => {
        if (remainingToRestore <= 0) {
          consumptionsProcessed++;
          checkConsumptionCompletion();
          return;
        }
        
        const quantityToRestore = Math.min(remainingToRestore, consumption.quantity);
        const newQuantity = consumption.quantity - quantityToRestore;
        
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
              
              // Восстанавливаем в price_history
              db.run(
                'UPDATE price_history SET ilosc_fixed = ilosc_fixed + ? WHERE id = ?',
                [quantityToRestore, consumption.batch_id],
                function(historyErr) {
                  if (historyErr) {
                    console.error(`❌ Error updating price_history ${consumption.batch_id}:`, historyErr);
                  } else {
                    console.log(`✅ Restored ${quantityToRestore} to price_history ${consumption.batch_id}`);
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
              
              // Восстанавливаем в price_history
              db.run(
                'UPDATE price_history SET ilosc_fixed = ilosc_fixed + ? WHERE id = ?',
                [quantityToRestore, consumption.batch_id],
                function(historyErr) {
                  if (historyErr) {
                    console.error(`❌ Error updating price_history ${consumption.batch_id}:`, historyErr);
                  } else {
                    console.log(`✅ Restored ${quantityToRestore} to price_history ${consumption.batch_id}`);
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
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📋 DELETE /api/orders/${id} - Deleting order`);
  
  // Сначала получаем продукты заказа для восстановления количества в working_sheets
  db.all('SELECT * FROM order_products WHERE orderId = ?', [id], (err, orderProducts) => {
    if (err) {
      console.error('❌ Database error fetching order products:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`🔄 Found ${orderProducts.length} products to restore in working_sheets`);
    
          // Сначала удаляем записи о списаниях
      db.run('DELETE FROM order_consumptions WHERE order_id = ?', [id], function(deleteConsumptionsErr) {
        if (deleteConsumptionsErr) {
          console.error('❌ Database error deleting order consumptions:', deleteConsumptionsErr);
          res.status(500).json({ error: deleteConsumptionsErr.message });
          return;
        }
        
        console.log(`🗑️ Order consumptions deleted for order ${id}`);
        
        // Затем удаляем продукты заказа
        db.run('DELETE FROM order_products WHERE orderId = ?', [id], function(deleteProductsErr) {
          if (deleteProductsErr) {
            console.error('❌ Database error deleting order products:', deleteProductsErr);
            res.status(500).json({ error: deleteProductsErr.message });
            return;
          }
          
          console.log(`🗑️ Order products deleted for order ${id}`);
          
          // Затем удаляем заказ
    db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('❌ Database error deleting order:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      console.log(`✅ Order ${id} deleted successfully`);
      
      // Восстанавливаем количество в working_sheets
      let restoredCount = 0;
      let totalProducts = orderProducts.length;
      
      if (totalProducts === 0) {
        console.log('💡 No products to restore');
        res.json({ 
          message: 'Order deleted successfully',
          workingSheetsRestored: 0
        });
        return;
      }
      
      let processedCount = 0;
      
      // Восстанавливаем FIFO из таблицы order_consumptions
      restoreFIFOFromConsumptions(id, orderProducts, function() {
              console.log(`📊 Working sheets restored: ${restoredCount}/${totalProducts} products`);
              res.json({ 
                message: 'Order deleted successfully',
          workingSheetsRestored: restoredCount,
          productsProcessed: processedCount
              });
      });
        });
      });
    });
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
        
        // Формируем структуру заказа с продуктами
        const orderWithProducts = {
          id: order.id,
          klient: order.klient,
          numer_zamowienia: order.numer_zamowienia,
          data_utworzenia: order.data_utworzenia,
          laczna_ilosc: order.laczna_ilosc,
          typ: order.typ || 'zamowienie',
          numer_zwrotu: order.numer_zwrotu || null,
          products: products || []
        };
        
        result.push(orderWithProducts);
        processedOrders++;
        
        // Когда все заказы обработаны, отправляем результат
        if (processedOrders === orders.length) {
          console.log(`✅ Sending ${result.length} orders with grouped products`);
          res.json(result);
        }
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
    'INSERT INTO order_products (orderId, kod, nazwa, ilosc, typ, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [orderId, kod, nazwa, ilosc, typ || 'sztuki'],
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
  
  db.run(
    'UPDATE clients SET nazwa = ?, firma = ?, adres = ?, kontakt = ?, czas_dostawy = ? WHERE id = ?',
    [nazwa, firma, adres, kontakt, czas_dostawy, id],
    function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Client ${id} updated successfully`);
      res.json({ message: 'Client updated successfully' });
    }
  );
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
  console.log('📦 Files check:', {
    hasFiles: !!req.files,
    hasProductInvoice: !!(req.files && req.files.productInvoice),
    hasTransportInvoice: !!(req.files && req.files.transportInvoice),
    productInvoiceFile: req.files?.productInvoice,
    transportInvoiceFile: req.files?.transportInvoice
  });
  
  let date, sprzedawca, wartosc, kosztDostawy, products, productInvoice, transportInvoice;
  
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
    productInvoice = req.body.productInvoice;
    transportInvoice = req.body.transportInvoice;
  }
  
  console.log('📦 POST /api/product-receipts - Creating new product receipt:', { 
    date, 
    sprzedawca, 
    wartosc, 
    productsCount: products?.length || 0 
  });
  
  if (!date || !products || !Array.isArray(products)) {
    console.log('❌ Validation failed: date and products array are required');
    return res.status(400).json({ error: 'Date and products array are required' });
  }
  
  console.log(`🔄 Processing ${products.length} products for receipt`);
  
  db.run(
    'INSERT INTO product_receipts (dataPrzyjecia, sprzedawca, wartosc, kosztDostawy, products, productInvoice, transportInvoice) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [date, sprzedawca || '', wartosc || 0, kosztDostawy || 0, JSON.stringify(products), productInvoice || null, transportInvoice || null],
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
      let updatedCount = 0;
      let insertedCount = 0;
      
      products.forEach((product, index) => {
        console.log(`🔄 Processing product ${index + 1}/${products.length}:`, product.kod);
        
        // Проверяем, есть ли товар с таким же кодом в working_sheets
        db.get('SELECT * FROM working_sheets WHERE kod = ?', [product.kod], (err, existingProduct) => {
          if (err) {
            console.error('❌ Error checking existing product:', err);
            return;
          }
          
          if (existingProduct) {
            // Проверяем, нужно ли обновить цену
            const shouldUpdatePrice = product.cena && (
              !existingProduct.cena || // У существующего товара нет цены
              parseFloat(product.cena) !== parseFloat(existingProduct.cena) // Цена изменилась
            );
            
            if (shouldUpdatePrice) {
              const oldPrice = existingProduct.cena || 0;
              const newPrice = product.cena;
              
              if (existingProduct.cena) {
                console.log(`💰 Price changed for ${product.kod}: ${existingProduct.cena}€ → ${newPrice}€`);
              } else {
                console.log(`💰 Setting first price for ${product.kod}: ${newPrice}€`);
              }
              
              // Сохраняем старую цену в price_history (даже если была 0 или null)
              // Важно: сохраняем количество, которое было по старой цене
              const oldPriceData = {
                ...existingProduct,
                ilosc: existingProduct.ilosc // Количество по старой цене
              };
              
              saveToPriceHistory(
                oldPriceData, 
                oldPrice, 
                existingProduct.data_waznosci || new Date().toISOString().split('T')[0]
              ).then(() => {
                console.log(`✅ Old price (${oldPrice}€) saved to history for: ${product.kod}`);
                
                // Обновляем working_sheets новой ценой + количество
                console.log(`📝 Updating product with new price: ${product.kod}`);
                db.run(
                  `UPDATE working_sheets SET 
                    ilosc = ilosc + ?, 
                    cena = ?, 
                    updated_at = CURRENT_TIMESTAMP 
                  WHERE kod = ?`,
                  [
                    product.ilosc,
                    newPrice,
                    product.kod
                  ],
                  function(updateErr) {
                    if (updateErr) {
                      console.error('❌ Error updating working_sheets with new price:', updateErr);
                    } else {
                      console.log(`✅ Updated product with new price: ${product.kod}`);
                      updatedCount++;
                    }
                    processedCount++;
                    checkCompletion();
                  }
                );
              }).catch((error) => {
                console.error('❌ Failed to save old price to history:', error);
                
                // Даже если не удалось сохранить в историю, обновляем working_sheets
                console.log(`📝 Updating product with new price (without history): ${product.kod}`);
                db.run(
                  `UPDATE working_sheets SET 
                    ilosc = ilosc + ?, 
                    cena = ?, 
                    updated_at = CURRENT_TIMESTAMP 
                  WHERE kod = ?`,
                  [
                    product.ilosc,
                    newPrice,
                    product.kod
                  ],
                  function(updateErr) {
                    if (updateErr) {
                      console.error('❌ Error updating working_sheets with new price:', updateErr);
                    } else {
                      console.log(`✅ Updated product with new price: ${product.kod}`);
                      updatedCount++;
                    }
                    processedCount++;
                    checkCompletion();
                  }
                );
              });
            } else {
              // Если цена не изменилась - только добавляем количество
              console.log(`📝 Updating quantity for existing product: ${product.kod}`);
            db.run(
              'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
              [product.ilosc, product.kod],
              function(updateErr) {
                if (updateErr) {
                    console.error('❌ Error updating quantity:', updateErr);
                } else {
                    console.log(`✅ Updated quantity for: ${product.kod}`);
                  updatedCount++;
                }
                processedCount++;
                checkCompletion();
              }
            );
            }
          } else {
            // Если товара нет - создаем новую запись со всеми полями
            console.log(`➕ Creating new product: ${product.kod}`);
            db.run(
              'INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                product.kod, 
                product.nazwa, 
                product.ilosc, 
                product.kod_kreskowy || null, 
                product.typ || null, 
                sprzedawca || null, 
                product.cena || null,
                product.dataWaznosci || null,
                product.objetosc || null
              ],
              function(insertErr) {
                if (insertErr) {
                  console.error('❌ Error inserting into working_sheets:', insertErr);
                } else {
                  console.log(`✅ Created new product: ${product.kod}`);
                  insertedCount++;
                }
                processedCount++;
                checkCompletion();
              }
            );
          }
        });
      });
      
      function checkCompletion() {
        if (processedCount === products.length) {
          console.log(`🎉 Processing complete: ${updatedCount} updated, ${insertedCount} inserted`);
          res.json({ 
            id: receiptId, 
            message: 'Product receipt added successfully',
            workingSheetsUpdated: updatedCount,
            workingSheetsInserted: insertedCount
          });
        }
      }
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
  
  let date, sprzedawca, wartosc, kosztDostawy, products, productInvoice, transportInvoice;
  
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
    productInvoice = req.body.productInvoice;
    transportInvoice = req.body.transportInvoice;
  }
  
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
  db.get('SELECT products, productInvoice, transportInvoice FROM product_receipts WHERE id = ?', [id], (err, oldReceipt) => {
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
    console.log(`🔄 Found ${oldProducts.length} old products, updating to ${products.length} new products`);
    
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
    
    db.run(
      'UPDATE product_receipts SET dataPrzyjecia = ?, sprzedawca = ?, wartosc = ?, kosztDostawy = ?, products = ?, productInvoice = ?, transportInvoice = ? WHERE id = ?',
      [date, sprzedawca || '', wartosc || 0, kosztDostawy || 0, JSON.stringify(products), finalProductInvoice, finalTransportInvoice, id],
      function(err) {
        if (err) {
          console.error('❌ Database error:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log('✅ Product receipt updated with ID:', id);
        console.log('📎 Files saved (PUT):', { productInvoice: finalProductInvoice, transportInvoice: finalTransportInvoice });
        
        // Обновляем товары в working_sheets
        let processedCount = 0;
        let updatedCount = 0;
        let insertedCount = 0;
        
        // Сначала восстанавливаем старые количества
        oldProducts.forEach((oldProduct) => {
          console.log(`🔄 Restoring old product quantity: ${oldProduct.kod} (removing: ${oldProduct.ilosc})`);
          db.run('UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?', [oldProduct.ilosc, oldProduct.kod], function(restoreErr) {
            if (restoreErr) {
              console.error('❌ Error restoring old quantities:', restoreErr);
            } else {
              console.log(`✅ Restored old quantity for: ${oldProduct.kod}`);
            }
          });
        });
        
        // Теперь применяем новые данные (включая все поля)
        products.forEach((product, index) => {
          console.log(`🔄 Processing updated product ${index + 1}/${products.length}:`, product.kod);
          
          // Проверяем, есть ли товар с таким же кодом в working_sheets
          db.get('SELECT * FROM working_sheets WHERE kod = ?', [product.kod], (err, existingProduct) => {
            if (err) {
              console.error('❌ Error checking existing product:', err);
              return;
            }
            
            if (existingProduct) {
              // Если товар существует - обновляем ВСЕ поля, включая количество
              console.log(`📝 Updating existing product: ${product.kod} with all fields`);
              db.run(
                `UPDATE working_sheets SET 
                  nazwa = ?, 
                  ilosc = ?, 
                  kod_kreskowy = ?, 
                  typ = ?, 
                  sprzedawca = ?, 
                  cena = ?, 
                  updated_at = CURRENT_TIMESTAMP 
                WHERE kod = ?`,
                [
                  product.nazwa,
                  product.ilosc,
                  product.kod_kreskowy || null,
                  product.typ || null,
                  sprzedawca || null,
                  product.cena || null,
                  product.kod
                ],
                function(updateErr) {
                  if (updateErr) {
                    console.error('❌ Error updating working_sheets:', updateErr);
                  } else {
                    console.log(`✅ Updated product: ${product.kod} with all fields`);
                    updatedCount++;
                  }
                  processedCount++;
                  checkCompletion();
                }
              );
            } else {
              // Если товара нет - создаем новую запись со всеми полями
              console.log(`➕ Creating new product: ${product.kod}`);
              db.run(
                'INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                  product.kod, 
                  product.nazwa, 
                  product.ilosc, 
                  product.kod_kreskowy || null, 
                  product.typ || null, 
                  sprzedawca || null, 
                  product.cena || null,
                  product.dataWaznosci || null,
                  product.objetosc || null
                ],
                function(insertErr) {
                  if (insertErr) {
                    console.error('❌ Error inserting into working_sheets:', insertErr);
                  } else {
                    console.log(`✅ Created new product: ${product.kod}`);
                    insertedCount++;
                  }
                  processedCount++;
                  checkCompletion();
                }
              );
            }
          });
        });
        
        function checkCompletion() {
          if (processedCount === products.length) {
            console.log(`🎉 Update processing complete: ${updatedCount} updated, ${insertedCount} inserted`);
            res.json({ 
              message: 'Product receipt updated successfully',
              workingSheetsUpdated: updatedCount,
              workingSheetsInserted: insertedCount
            });
          }
        }
      }
    );
  });
});

app.delete('/api/product-receipts/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📦 DELETE /api/product-receipts/${id} - Deleting product receipt`);
  
  // Сначала получаем данные приемки для удаления товаров из working_sheets
  db.get('SELECT products FROM product_receipts WHERE id = ?', [id], (err, receipt) => {
    if (err) {
      console.error('❌ Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!receipt) {
      console.log(`❌ Product receipt with ID ${id} not found`);
      return res.status(404).json({ error: 'Product receipt not found' });
    }
    
    const products = JSON.parse(receipt.products || '[]');
    console.log(`🔄 Found ${products.length} products to remove from working_sheets`);
    
    // Удаляем приемку
    db.run('DELETE FROM product_receipts WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      
      console.log('✅ Product receipt deleted with ID:', id);
      
      // Удаляем товары из working_sheets
      let processedCount = 0;
      let updatedCount = 0;
      
      products.forEach((product, index) => {
        console.log(`🔄 Processing deletion for product ${index + 1}/${products.length}:`, product.kod);
        
        // Проверяем, есть ли товар в working_sheets
        db.get('SELECT * FROM working_sheets WHERE kod = ?', [product.kod], (err, existingProduct) => {
          if (err) {
            console.error('❌ Error checking existing product:', err);
            return;
          }
          
          if (existingProduct) {
            // При удалении приемки - восстанавливаем количество до состояния до создания этой приемки
            const newQuantity = existingProduct.ilosc - product.ilosc;
            console.log(`📝 Restoring product quantity: ${product.kod} (current: ${existingProduct.ilosc}, removing: ${product.ilosc}, new: ${newQuantity})`);
            
            if (newQuantity <= 0) {
              // Если количество становится 0 или меньше - архивируем запись вместо удаления
              console.log(`📦 Archiving product: ${product.kod} (quantity would be ${newQuantity} - archiving record)`);
              db.run(
                `UPDATE working_sheets SET 
                  ilosc = 0, 
                  archived = 1, 
                  archived_at = CURRENT_TIMESTAMP 
                WHERE kod = ?`,
                [product.kod],
                function(archiveErr) {
                  if (archiveErr) {
                    console.error('❌ Error archiving from working_sheets:', archiveErr);
                  } else {
                    console.log(`✅ Archived product: ${product.kod}`);
                    updatedCount++;
                  }
                  processedCount++;
                  checkCompletion();
                }
              );
            } else {
              // Если количество больше 0 - обновляем количество
              console.log(`📝 Updating product quantity: ${product.kod} (new quantity: ${newQuantity})`);
              db.run(
                'UPDATE working_sheets SET ilosc = ? WHERE kod = ?',
                [newQuantity, product.kod],
                function(updateErr) {
                  if (updateErr) {
                    console.error('❌ Error updating working_sheets:', updateErr);
                  } else {
                    console.log(`✅ Updated product: ${product.kod} (new quantity: ${newQuantity})`);
                    updatedCount++;
                  }
                  processedCount++;
                  checkCompletion();
                }
              );
            }
          } else {
            console.log(`⚠️ Product not found in working_sheets: ${product.kod}`);
            processedCount++;
            checkCompletion();
          }
        });
      });
      
      function checkCompletion() {
        if (processedCount === products.length) {
          console.log(`🎉 Deletion processing complete: ${updatedCount} products updated`);
          res.json({ 
            message: 'Product receipt deleted successfully',
            workingSheetsUpdated: updatedCount
          });
        }
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

// Search working sheets
app.get('/api/working-sheets/search', (req, res) => {
  const { query } = req.query;
  console.log(`🔍 GET /api/working-sheets/search - Searching working sheets with query: "${query}"`);
  
  if (!query) {
    console.log('❌ Validation failed: query parameter is required');
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  db.all(
    'SELECT * FROM working_sheets WHERE kod LIKE ? OR nazwa LIKE ? OR kod_kreskowy LIKE ? ORDER BY nazwa LIMIT 50',
    [`%${query}%`, `%${query}%`, `%${query}%`],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found ${rows.length} working sheets matching "${query}"`);
      res.json(rows || []);
    }
  );
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

app.put('/api/working-sheets/update', (req, res) => {
  const { id, kod, nazwa, ilosc, typ, kod_kreskowy, data_waznosci, rezerwacje, objetosc, sprzedawca, cena, cena_sprzedazy } = req.body;
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
    
    // Обновляем запись
    db.run(
      'UPDATE working_sheets SET kod = ?, nazwa = ?, ilosc = ?, typ = ?, kod_kreskowy = ?, data_waznosci = ?, rezerwacje = ?, objetosc = ?, sprzedawca = ?, cena = ?, cena_sprzedazy = ? WHERE id = ?',
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
        cena || existingRecord.cena,
        cena_sprzedazy || existingRecord.cena_sprzedazy,
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

// Price History API
app.get('/api/price-history', (req, res) => {
  db.all('SELECT * FROM price_history ORDER BY data_zmiany DESC', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

// Функция для списания товара по FIFO принципу с отслеживанием списаний
const consumeFromPriceHistory = (productKod, quantity, orderId = null) => {
  return new Promise((resolve, reject) => {
    // Получаем все партии по FIFO (сначала старые)
    db.all(
      'SELECT * FROM price_history WHERE kod = ? ORDER BY data_zmiany ASC',
      [productKod],
      (err, batches) => {
        if (err) {
          console.error('❌ Error getting price history batches:', err);
          reject(err);
          return;
        }
        
        if (batches.length === 0) {
          console.log(`⚠️ No available batches for product: ${productKod}`);
          resolve({ consumed: 0, remaining: quantity, consumptions: [] });
          return;
        }
        
        console.log(`🎯 FIFO consumption for ${productKod}: ${quantity} szt. from ${batches.length} batches`);
        console.log(`📊 Batches: ${batches.map(b => `${b.ilosc_fixed} szt. @ ${b.cena}€`).join(', ')}`);
        
        let remainingQuantity = quantity;
        let consumedTotal = 0;
        let processedBatches = 0;
        const consumptions = []; // Массив для отслеживания списаний
        
        // Обрабатываем каждую партию по FIFO (одновременное списание)
        const processNextBatch = () => {
          if (remainingQuantity <= 0 || processedBatches === batches.length) {
            // Все партии обработаны или количество исчерпано
            console.log(`🎯 FIFO consumption complete: ${consumedTotal} szt. consumed, ${remainingQuantity} szt. remaining`);
            
            // FIFO списание завершено - working_sheets уже обновлен в endpoint
            console.log(`✅ FIFO consumption complete: ${consumedTotal} szt. consumed, ${remainingQuantity} szt. remaining`);
            
            // Если есть orderId, записываем списания в order_consumptions
            console.log(`🔍 Checking orderId: ${orderId}, consumptions length: ${consumptions.length}`);
            if (orderId && consumptions.length > 0) {
              console.log(`📝 Saving ${consumptions.length} consumption records for order ${orderId}`);
              saveConsumptionsToDatabase(orderId, consumptions, productKod)
                .then(() => {
                  console.log(`✅ Saved ${consumptions.length} consumption records for order ${orderId}`);
                  resolve({ consumed: consumedTotal, remaining: remainingQuantity, consumptions });
                })
                .catch((saveErr) => {
                  console.error('❌ Error saving consumptions:', saveErr);
                  // Даже если не удалось сохранить, возвращаем результат
                  resolve({ consumed: consumedTotal, remaining: remainingQuantity, consumptions });
                });
            } else {
              console.log(`⚠️ Skipping consumption save: orderId=${orderId}, consumptions=${consumptions.length}`);
              resolve({ consumed: consumedTotal, remaining: remainingQuantity, consumptions });
            }
            return;
          }
          
          const batch = batches[processedBatches];
          
          // Если в этой партии уже нет товара, переходим к следующей
          if (batch.ilosc_fixed <= 0) {
            console.log(`⏭️ Skipping empty batch ${batch.id} (ilosc_fixed: 0)`);
            processedBatches++;
            processNextBatch();
            return;
          }
          
          const availableInBatch = Math.min(batch.ilosc_fixed, remainingQuantity);
          const newIloscFixed = batch.ilosc_fixed - availableInBatch;
          
          console.log(`🔄 Consuming from batch ${batch.id}: ${availableInBatch} szt. (${batch.cena}€) - ilosc_fixed: ${batch.ilosc_fixed} → ${newIloscFixed}`);
          
          // Записываем информацию о списании
          consumptions.push({
            batchId: batch.id,
            quantity: availableInBatch,
            price: batch.cena
          });
          
          // Обновляем ilosc_fixed в price_history (одновременное списание)
  db.run(
            'UPDATE price_history SET ilosc_fixed = ? WHERE id = ?',
            [newIloscFixed, batch.id],
            function(updateErr) {
              if (updateErr) {
                console.error('❌ Error updating batch ilosc_fixed:', updateErr);
              } else {
                console.log(`✅ Updated batch ${batch.id} ilosc_fixed: ${newIloscFixed}`);
              }
              
              remainingQuantity -= availableInBatch;
              consumedTotal += availableInBatch;
              processedBatches++;
              
              // Продолжаем с следующей партией
              processNextBatch();
            }
          );
        };
        
        // Начинаем обработку партий
        processNextBatch();
      }
    );
  });
};

// Функция для сохранения списаний в базу данных
const saveConsumptionsToDatabase = (orderId, consumptions, productKod) => {
  return new Promise((resolve, reject) => {
    if (consumptions.length === 0) {
      resolve();
      return;
    }
    
    let savedCount = 0;
    let totalCount = consumptions.length;
    
    consumptions.forEach((consumption) => {
      db.run(
        'INSERT INTO order_consumptions (order_id, product_kod, batch_id, quantity, batch_price) VALUES (?, ?, ?, ?, ?)',
        [orderId, productKod, consumption.batchId, consumption.quantity, consumption.price],
    function(err) {
      if (err) {
            console.error('❌ Error saving consumption record:', err);
            reject(err);
        return;
      }
          
          savedCount++;
          if (savedCount === totalCount) {
            console.log(`✅ All ${totalCount} consumption records saved successfully`);
            resolve();
          }
    }
  );
});
  });
};

// Функция для восстановления товара в FIFO (при уменьшении заказа)
const restoreToPriceHistory = (productKod, quantity) => {
  return new Promise((resolve, reject) => {
    // Находим самую новую партию и восстанавливаем в неё
    db.get(
      'SELECT * FROM price_history WHERE kod = ? ORDER BY data_zmiany DESC LIMIT 1',
      [productKod],
      function(err, latestBatch) {
        if (err) {
          console.error('❌ Error finding latest batch for restoration:', err);
          reject(err);
          return;
        }
        
        if (latestBatch) {
          console.log(`🔄 Restoring ${quantity} szt. to latest batch ${latestBatch.id} for ${productKod}`);
          
          db.run(
            'UPDATE price_history SET ilosc_fixed = ilosc_fixed + ? WHERE id = ?',
            [quantity, latestBatch.id],
            function(updateErr) {
              if (updateErr) {
                console.error('❌ Error updating price_history for restoration:', updateErr);
                reject(updateErr);
              } else {
                console.log(`✅ Restored ${quantity} szt. to price_history for ${productKod}`);
                resolve({ restored: quantity, batchId: latestBatch.id });
              }
            }
          );
        } else {
          console.log(`⚠️ No price history found for ${productKod}, skipping FIFO restoration`);
          resolve({ restored: 0, batchId: null });
        }
      }
    );
  });
};

// Функция для восстановления FIFO из таблицы order_consumptions при удалении заказа
const restoreFIFOFromConsumptions = (orderId, orderProducts, callback) => {
  console.log(`🔄 Restoring FIFO for order ${orderId} from consumptions table`);
  
  // Получаем записи о списаниях для этого заказа
  db.all('SELECT * FROM order_consumptions WHERE order_id = ?', [orderId], (err, consumptions) => {
    if (err) {
      console.error('❌ Error fetching consumptions:', err);
      // Если не удалось получить списания, восстанавливаем только в working_sheets
      restoreOnlyWorkingSheets(orderProducts, callback);
      return;
    }
    
    if (consumptions.length === 0) {
      console.log('⚠️ No consumption records found, restoring only in working_sheets');
      restoreOnlyWorkingSheets(orderProducts, callback);
      return;
    }
    
    console.log(`📊 Found ${consumptions.length} consumption records for restoration`);
    
    // Группируем списания по продуктам
    const productConsumptions = {};
    consumptions.forEach(consumption => {
      if (!productConsumptions[consumption.product_kod]) {
        productConsumptions[consumption.product_kod] = [];
      }
      productConsumptions[consumption.product_kod].push(consumption);
    });
    
    let restoredCount = 0;
    let totalProducts = orderProducts.length;
    
    orderProducts.forEach((product) => {
      const consumptionsForProduct = productConsumptions[product.kod] || [];
      
      if (consumptionsForProduct.length > 0) {
        // Восстанавливаем FIFO в точные партии
        restoreFIFOToExactBatches(product, consumptionsForProduct, () => {
          restoredCount++;
          if (restoredCount === totalProducts) {
            callback();
          }
        });
      } else {
        // Если нет записей о списаниях, восстанавливаем только в working_sheets
        restoreOnlyWorkingSheets([product], () => {
          restoredCount++;
          if (restoredCount === totalProducts) {
            callback();
          }
        });
      }
    });
  });
};

// Функция для восстановления FIFO в точные партии
const restoreFIFOToExactBatches = (product, consumptions, callback) => {
  console.log(`🔄 Restoring FIFO for ${product.kod} to exact batches`);
  
  // Сначала восстанавливаем в working_sheets
  db.run(
    'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
    [product.ilosc, product.kod],
    function(restoreErr) {
      if (restoreErr) {
        console.error(`❌ Error restoring quantity for product ${product.kod}:`, restoreErr);
        callback();
        return;
      }
      
      console.log(`✅ Restored quantity for product ${product.kod}: +${product.ilosc}`);
      
      // Теперь восстанавливаем в точные партии по FIFO
      let processedConsumptions = 0;
      
      consumptions.forEach((consumption) => {
  db.run(
          'UPDATE price_history SET ilosc_fixed = ilosc_fixed + ? WHERE id = ?',
          [consumption.quantity, consumption.batch_id],
          function(historyUpdateErr) {
            if (historyUpdateErr) {
              console.error(`❌ Error updating price_history for batch ${consumption.batch_id}:`, historyUpdateErr);
            } else {
              console.log(`✅ Restored ${consumption.quantity} szt. to batch ${consumption.batch_id} for ${product.kod}`);
            }
            
            processedConsumptions++;
            if (processedConsumptions === consumptions.length) {
              callback();
            }
          }
        );
      });
    }
  );
};

// Функция для восстановления только в working_sheets (fallback)
const restoreOnlyWorkingSheets = (products, callback) => {
  console.log('🔄 Restoring only in working_sheets (FIFO fallback)');
  
  let restoredCount = 0;
  let totalProducts = products.length;
  
  products.forEach((product) => {
    db.run(
      'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
      [product.ilosc, product.kod],
      function(restoreErr) {
        if (restoreErr) {
          console.error(`❌ Error restoring quantity for product ${product.kod}:`, restoreErr);
        } else {
          console.log(`✅ Restored quantity for product ${product.kod}: +${product.ilosc}`);
        }
        
        restoredCount++;
        if (restoredCount === totalProducts) {
          callback();
        }
      }
    );
  });
};

// Функция для сохранения старой цены в историю
const saveToPriceHistory = (existingProduct, oldPrice, oldDate) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO price_history (product_id, kod, nazwa, cena, data_zmiany, ilosc_fixed) VALUES (?, ?, ?, ?, ?, ?)',
      [existingProduct.produkt_id || null, existingProduct.kod, existingProduct.nazwa, oldPrice, oldDate, existingProduct.ilosc],
      function(err) {
        if (err) {
          console.error('❌ Error saving to price history:', err);
          reject(err);
        } else {
          console.log(`✅ Saved old price to history: ${existingProduct.kod} - ${oldPrice}€ (${existingProduct.ilosc} szt.)`);
          resolve(this.lastID);
        }
      }
    );
  });
};

app.post('/api/price-history', (req, res) => {
  const { product_id, kod, nazwa, cena, data_zmiany, ilosc_fixed } = req.body;
  
  if (!kod || !nazwa || !cena || !data_zmiany) {
    return res.status(400).json({ error: 'Kod, nazwa, cena, and data_zmiany are required' });
  }
  
  db.run(
    'INSERT INTO price_history (product_id, kod, nazwa, cena, data_zmiany, ilosc_fixed) VALUES (?, ?, ?, ?, ?, ?)',
    [product_id, kod, nazwa, cena, data_zmiany, ilosc_fixed || 0],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Price history added successfully' });
    }
  );
});



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

// PDF Generation API
app.get('/api/orders/:id/pdf', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Получаем данные заказа с продуктами
    const orderQuery = `
      SELECT o.*, c.firma, c.nazwa as client_name, c.adres, c.kontakt
      FROM orders o
      LEFT JOIN clients c ON o.klient = c.nazwa
      WHERE o.id = ?
    `;
    
    const orderProductsQuery = `
      SELECT op.*, p.nazwa as product_name
      FROM order_products op
      LEFT JOIN products p ON op.kod = p.kod
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

// Функция генерации PDF заказа
async function generateOrderPDF(order, products, res) {
  try {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    
    // Создаем новый PDF документ
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 размер
    
    // Получаем стандартные шрифты
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const { width, height } = page.getSize();
    const margin = 50;
    let yPosition = height - margin;
    
    // Заголовок
    page.drawText('EnoTerra ERP - Zamówienie', {
      x: margin,
      y: yPosition,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;
    
    // Информация о заказе
    page.drawText(`Numer zamówienia: ${order.numer_zamowienia}`, {
      x: margin,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    yPosition -= 25;
    
    page.drawText(`Data utworzenia: ${order.data_utworzenia || new Date().toLocaleDateString('pl-PL')}`, {
      x: margin,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 30;
    
    // Информация о клиенте
    if (order.client_name) {
      page.drawText('Dane klienta:', {
        x: margin,
        y: yPosition,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      yPosition -= 20;
      
      page.drawText(`Firma: ${order.firma || order.client_name}`, {
        x: margin,
        y: yPosition,
        size: 12,
        font: helveticaFont,
        color: rgb(0, 0, 0)
      });
      yPosition -= 18;
      
      if (order.adres) {
        page.drawText(`Adres: ${order.adres}`, {
          x: margin,
          y: yPosition,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0)
        });
        yPosition -= 18;
      }
      
      if (order.kontakt) {
        page.drawText(`Kontakt: ${order.kontakt}`, {
          x: margin,
          y: yPosition,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0)
        });
        yPosition -= 25;
      }
    }
    
    // Таблица продуктов
    if (products && products.length > 0) {
      yPosition -= 20;
      page.drawText('Produkty w zamówieniu:', {
        x: margin,
        y: yPosition,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      yPosition -= 25;
      
      // Заголовки таблицы
      const columns = [
        { x: margin, width: 80, title: 'Kod' },
        { x: margin + 90, width: 200, title: 'Nazwa' },
        { x: margin + 300, width: 100, title: 'Kod kreskowy' },
        { x: margin + 410, width: 60, title: 'Ilość' },
        { x: margin + 480, width: 80, title: 'Typ' }
      ];
      
      // Рисуем заголовки
      columns.forEach(col => {
        page.drawText(col.title, {
          x: col.x,
          y: yPosition,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0)
        });
      });
      yPosition -= 20;
      
      // Рисуем данные продуктов
      products.forEach((product, index) => {
        if (yPosition < margin + 100) {
          // Добавляем новую страницу если не хватает места
          page = pdfDoc.addPage([595.28, 841.89]);
          yPosition = height - margin;
        }
        
        page.drawText(product.kod || '', {
          x: columns[0].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: rgb(0, 0, 0)
        });
        
        page.drawText(product.product_name || product.nazwa || '', {
          x: columns[1].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: rgb(0, 0, 0)
        });
        
        page.drawText(product.kod_kreskowy || '-', {
          x: columns[2].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: rgb(0, 0, 0)
        });
        
        page.drawText(product.ilosc?.toString() || '0', {
          x: columns[3].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: rgb(0, 0, 0)
        });
        
        page.drawText(product.typ || '-', {
          x: columns[4].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: rgb(0, 0, 0)
        });
        
        yPosition -= 15;
      });
      
      // Итого
      yPosition -= 20;
      page.drawText(`Razem produktów: ${products.length}`, {
        x: margin,
        y: yPosition,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      yPosition -= 20;
      
      page.drawText(`Łączna ilość: ${order.laczna_ilosc || 0}`, {
        x: margin,
        y: yPosition,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
    }
    
    // Футер
    yPosition = margin;
    page.drawText(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, {
      x: margin,
      y: yPosition,
      size: 8,
      font: helveticaFont,
      color: rgb(0.5, 0.5, 0.5)
    });
    
    // Сохраняем PDF
    const pdfBytes = await pdfDoc.save();
    
    // Отправляем PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="order_${order.numer_zamowienia}.pdf"`);
    res.send(Buffer.from(pdfBytes));
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}

}); // Закрываем блок db.serialize

// Serve static files from parent directory (frontend)
app.use(express.static(path.join(__dirname, '..')));

// ВАЖНО: SPA Fallback маршрут ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ!
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../index.html');
  console.log('Serving SPA fallback:', indexPath);
  res.sendFile(indexPath);
});

// Start server
const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`🚀 EnoTerra ERP Server running on port ${PORT}`);
  console.log(`📂 Serving static files from: ${path.join(__dirname, '..')}`);
  console.log(`💾 Database located at: ${dbPath}`);
});

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

// Получение стоимости товаров (SUM(ilosc * cena) для каждого kod)
app.get('/api/products/wartosc-towaru', (req, res) => {
  console.log('📦 GET /api/products/wartosc-towaru - Fetching product values');
  db.all(
    `SELECT kod, SUM(ilosc * cena) as wartosc 
     FROM products 
     GROUP BY kod`,
    [],
    (err, rows) => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`✅ Found wartosc for ${rows.length} products`);
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

// Функция генерации PDF заказа
async function generateOrderPDF(order, products, res) {
  try {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    
    // Создаем новый PDF документ
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 размер
    
    // Получаем стандартные шрифты с поддержкой Unicode
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    

    
    const { width, height } = page.getSize();
    const margin = 50;
    let yPosition = height - margin;
    
    // Цвета из HTML шаблона
    const colors = {
      background: rgb(0.976, 0.976, 0.976), // #f9fafb
      white: rgb(1, 1, 1), // white
      border: rgb(0.82, 0.82, 0.82), // #d1d5db
      headerBg: rgb(0.95, 0.95, 0.95), // #f3f4f6
      text: rgb(0.22, 0.22, 0.22), // #374151
      textDark: rgb(0.12, 0.12, 0.12), // #1f2937
      textLight: rgb(0.61, 0.64, 0.69), // #9ca3af
      blue: rgb(0.2, 0.4, 0.8)
    };
    
    // Основной контейнер (фон страницы)
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: colors.background
    });
    
    // Белый контейнер с тенью (имитация box-shadow)
    const containerMargin = 24;
    const containerWidth = width - 2 * containerMargin;
    const containerHeight = height - 2 * containerMargin;
    
    // Тень
    page.drawRectangle({
      x: containerMargin + 4,
      y: containerMargin - 4,
      width: containerWidth,
      height: containerHeight,
      color: rgb(0, 0, 0, 0.1)
    });
    
    // Основной контейнер
    page.drawRectangle({
      x: containerMargin,
      y: containerMargin,
      width: containerWidth,
      height: containerHeight,
      color: colors.white
    });
    
    // Заголовок документа
    page.drawText('EnoTerra ERP - Zamówienie', {
      x: containerMargin + 24,
      y: height - containerMargin - 40,
      size: 20,
      font: helveticaBold,
      color: colors.textDark
    });
    
    yPosition = height - containerMargin - 80;
    
    // Информация о заказе
    page.drawText(`Numer zamówienia: ${order.numer_zamowienia}`, {
      x: containerMargin + 24,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: colors.textDark
    });
    yPosition -= 25;
    
    page.drawText(`Data utworzenia: ${order.data_utworzenia || new Date().toLocaleDateString('pl-PL')}`, {
      x: containerMargin + 24,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: colors.text
    });
    yPosition -= 30;
    
    // Информация о клиенте
    if (order.client_name) {
      // Секция клиента
      page.drawText('Dane klienta:', {
        x: containerMargin + 24,
        y: yPosition,
        size: 14,
        font: helveticaBold,
        color: colors.textDark
      });
      yPosition -= 25;
      
      page.drawText(`Firma: ${order.firma || order.client_name}`, {
        x: containerMargin + 24,
        y: yPosition,
        size: 12,
        font: helveticaFont,
        color: colors.text
      });
      yPosition -= 18;
      
      if (order.adres) {
        page.drawText(`Adres: ${order.adres}`, {
          x: containerMargin + 24,
          y: yPosition,
          size: 12,
          font: helveticaFont,
          color: colors.text
        });
        yPosition -= 18;
      }
      
      if (order.kontakt) {
        page.drawText(`Kontakt: ${order.kontakt}`, {
          x: containerMargin + 24,
          y: yPosition,
          size: 12,
          font: helveticaFont,
          color: colors.text
        });
        yPosition -= 25;
      }
    }
    
    // Таблица продуктов
    if (products && products.length > 0) {
      yPosition -= 20;
      // Секция продуктов
      page.drawText('Produkty w zamówieniu:', {
        x: containerMargin + 24,
        y: yPosition,
        size: 14,
        font: helveticaBold,
        color: colors.textDark
      });
      yPosition -= 30;
      
      // Заголовки таблицы
      const tableX = containerMargin + 24;
      const columns = [
        { x: tableX, width: 80, title: 'Kod' },
        { x: tableX + 90, width: 200, title: 'Nazwa' },
        { x: tableX + 300, width: 100, title: 'Kod kreskowy' },
        { x: tableX + 410, width: 60, title: 'Ilość' },
        { x: tableX + 480, width: 80, title: 'Typ' }
      ];
      
      // Фон для заголовков таблицы
      page.drawRectangle({
        x: tableX - 6,
        y: yPosition - 6,
        width: width - 2 * containerMargin - 36,
        height: 25,
        color: colors.headerBg
      });
      
      // Рисуем заголовки
      columns.forEach(col => {
        page.drawText(col.title, {
          x: col.x,
          y: yPosition,
          size: 10,
          font: helveticaBold,
          color: colors.text
        });
      });
      yPosition -= 25;
      
      // Рисуем данные продуктов
      products.forEach((product, index) => {
        if (yPosition < margin + 100) {
          // Добавляем новую страницу если не хватает места
          page = pdfDoc.addPage([595.28, 841.89]);
          yPosition = height - margin;
        }
        
        // Фон для четных строк (как в HTML)
        if (index % 2 === 1) {
          page.drawRectangle({
            x: tableX - 6,
            y: yPosition - 2,
            width: width - 2 * containerMargin - 36,
            height: 19,
            color: colors.background
          });
        }
        
        page.drawText(product.kod || '', {
          x: columns[0].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: colors.text
        });
        
        page.drawText(product.product_name || product.nazwa || '', {
          x: columns[1].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: colors.text
        });
        
        page.drawText(product.kod_kreskowy || '-', {
          x: columns[2].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: colors.text
        });
        
        page.drawText(product.ilosc?.toString() || '0', {
          x: columns[3].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: colors.text
        });
        
        page.drawText(product.typ || '-', {
          x: columns[4].x,
          y: yPosition,
          size: 9,
          font: helveticaFont,
          color: colors.text
        });
        
        yPosition -= 15;
      });
      
      // Итого
      yPosition -= 20;
      // Итоговая секция
      page.drawText(`Razem produktów: ${products.length}`, {
        x: containerMargin + 24,
        y: yPosition,
        size: 12,
        font: helveticaBold,
        color: colors.textDark
      });
      yPosition -= 20;
      
      page.drawText(`Łączna ilość: ${order.laczna_ilosc || 0}`, {
        x: containerMargin + 24,
        y: yPosition,
        size: 12,
        font: helveticaBold,
        color: colors.textDark
      });
    }
    
    // Футер
    yPosition = containerMargin + 24;
    page.drawText(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, {
      x: containerMargin + 24,
      y: yPosition,
      size: 8,
      font: helveticaFont,
      color: colors.textLight
    });
    
    // Сохраняем PDF
    const pdfBytes = await pdfDoc.save();
    
    // Отправляем PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="order_${order.numer_zamowienia}.pdf"`);
    res.send(Buffer.from(pdfBytes));
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    
    // Если ошибка связана с кодировкой, попробуем создать PDF без польских символов
    if (error.message && error.message.includes('WinAnsi cannot encode')) {
      console.log('Trying to generate PDF with ASCII characters...');
      try {
        // Создаем простую версию PDF без польских символов
        const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]);
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const { width, height } = page.getSize();
        const margin = 50;
        let yPosition = height - margin;
        
                 // Заголовок без польских символов
         page.drawText('EnoTerra ERP - Zamowienie', {
           x: margin,
           y: yPosition,
           size: 24,
           font: helveticaBold,
           color: rgb(0, 0, 0)
         });
         yPosition -= 40;
         
         page.drawText(`Numer zamowienia: ${order.numer_zamowienia}`, {
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
         }
         
         if (products && products.length > 0) {
           yPosition -= 20;
           page.drawText('Produkty w zamowieniu:', {
             x: margin,
             y: yPosition,
             size: 14,
             font: helveticaBold,
             color: rgb(0, 0, 0)
           });
           yPosition -= 25;
           
           const columns = [
             { x: margin, width: 80, title: 'Kod' },
             { x: margin + 90, width: 200, title: 'Nazwa' },
             { x: margin + 300, width: 100, title: 'Kod kreskowy' },
             { x: margin + 410, width: 60, title: 'Ilosc' },
             { x: margin + 480, width: 80, title: 'Typ' }
           ];
          
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
          
          products.forEach((product, index) => {
            if (yPosition < margin + 100) {
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
          
                     yPosition -= 20;
           page.drawText(`Razem produktow: ${products.length}`, {
             x: margin,
             y: yPosition,
             size: 12,
             font: helveticaBold,
             color: rgb(0, 0, 0)
           });
           yPosition -= 20;
           
           page.drawText(`Laczna ilosc: ${order.laczna_ilosc || 0}`, {
             x: margin,
             y: yPosition,
             size: 12,
             font: helveticaBold,
             color: rgb(0, 0, 0)
           });
         }
         
         yPosition = margin;
         page.drawText(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, {
           x: margin,
           y: yPosition,
           size: 8,
           font: helveticaFont,
           color: rgb(0.5, 0.5, 0.5)
         });
        
        const pdfBytes = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="order_${order.numer_zamowienia}.pdf"`);
        res.send(Buffer.from(pdfBytes));
        return;
      } catch (fallbackError) {
        console.error('Fallback PDF generation also failed:', fallbackError);
        res.status(500).json({ error: 'Failed to generate PDF (encoding issue)' });
        return;
      }
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
            console.log(`📝 Creating order_products record for: ${kod} (orderId: ${orderId})`);
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
                  productsCreated++;
                  console.log(`✅ Product ${index + 1} created for order ${orderId} with ID: ${this.lastID}`);
                  
                  // Теперь обновляем количество в working_sheets
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
                        
                        // Теперь списываем по FIFO из products с отслеживанием
                        consumeFromProducts(kod, ilosc)
                          .then(({ consumed, remaining, consumptions }) => {
                            console.log(`🎯 FIFO consumption for ${kod}: ${consumed} szt. consumed`);
                            // Записываем списания партий в order_consumptions
                            if (consumptions && consumptions.length > 0) {
                              const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
                              const values = consumptions.flatMap(c => [orderId, kod, c.batchId, c.qty, c.cena]);
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
        smartUpdateOrderProducts(oldOrderProducts);
      }
    );
  });
  
  function smartUpdateOrderProducts(oldOrderProducts) {
    console.log(`🧠 Smart update: processing ${products.length} new products against ${oldOrderProducts.length} existing products`);
    
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
      
      console.log(`🔄 Updating existing product ${key}: ${oldQuantity} → ${newQuantity} (diff: ${quantityDiff})`);
      
      // Обновляем запись в order_products
      db.run(
        'UPDATE order_products SET ilosc = ?, nazwa = ?, kod_kreskowy = ? WHERE id = ?',
        [ilosc, nazwa, kod_kreskowy || null, oldProduct.id],
        function(err) {
          if (err) {
            console.error(`❌ Error updating product ${key}:`, err);
          } else {
            console.log(`✅ Updated product ${key} (ID: ${oldProduct.id})`);
            
            // Обрабатываем изменение количества
            if (quantityDiff > 0) {
              console.log(`📈 Quantity increased by ${quantityDiff}`);
              processQuantityIncrease(kod, quantityDiff, () => {
                operationCompleted();
              });
            } else if (quantityDiff < 0) {
              console.log(`📉 Quantity decreased by ${Math.abs(quantityDiff)}`);
              processQuantityDecrease(kod, Math.abs(quantityDiff), () => {
                operationCompleted();
              });
            } else {
              console.log(`➡️ Quantity unchanged`);
              operationCompleted();
            }
          }
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
            console.log(`✅ Inserted new product ${key} (ID: ${this.lastID})`);
            
            // Списываем количество по FIFO
            processQuantityIncrease(kod, Number(ilosc), () => {
              operationCompleted();
            });
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
                  processQuantityDecrease(kod, Number(ilosc), () => {
                    operationCompleted();
                  });
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
              processQuantityDecrease(kod, Number(ilosc), () => {
                operationCompleted();
              });
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
  function processQuantityIncrease(productKod, quantityDiff, callback) {
    console.log(`🔄 Processing quantity increase for ${productKod}: +${quantityDiff}`);
    console.log(`🔍 processQuantityIncrease called with: productKod=${productKod}, quantityDiff=${quantityDiff}`);
    console.log(`🔍 processQuantityIncrease: starting FIFO consumption...`);
    
    // Проверяем доступность товара
    console.log(`🔍 processQuantityIncrease: checking availability in working_sheets for ${productKod}`);
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
      console.log(`🔍 processQuantityIncrease: available quantity in working_sheets = ${availableQuantity}`);
      if (availableQuantity < quantityDiff) {
        console.error(`❌ Insufficient quantity for ${productKod}: need ${quantityDiff}, available ${availableQuantity}`);
        callback();
        return;
      }
      
      // Товар доступен, списываем разницу по FIFO
      console.log(`🎯 FIFO consumption for ${productKod}: ${quantityDiff} szt.`);
      console.log(`🔍 processQuantityIncrease: calling consumeFromProducts...`);
      consumeFromProducts(productKod, quantityDiff)
        .then(({ consumed, remaining, consumptions }) => {
          console.log(`🎯 FIFO consumption for ${productKod}: ${consumed} szt. consumed`);
          // Записываем списания партий в order_consumptions
          if (consumptions && consumptions.length > 0) {
            const placeholders = consumptions.map(() => '(?, ?, ?, ?, ?)').join(', ');
            const values = consumptions.flatMap(c => [id, productKod, c.batchId, c.qty, c.cena]);
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
  }
  
  // Функция для обработки уменьшения количества продукта
  function processQuantityDecrease(productKod, quantityDiff, callback) {
    console.log(`🔄 Processing quantity decrease for ${productKod}: -${quantityDiff}`);
    console.log(`🔍 processQuantityDecrease: starting restoration process...`);
    
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
      
      orderProducts.forEach((product) => {
        db.run(
          'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
          [product.ilosc, product.kod],
          function(restoreErr) {
            if (restoreErr) {
              console.error(`❌ Error restoring quantity for product ${product.kod}:`, restoreErr);
            } else {
              console.log(`✅ Restored quantity for product ${product.kod}: +${product.ilosc}`);
              restoredCount++;
            }
            
            if (restoredCount === totalProducts) {
              console.log(`📊 Working sheets restored: ${restoredCount}/${totalProducts} products`);
              res.json({ 
                message: 'Order deleted successfully',
          workingSheetsRestored: restoredCount,
          productsProcessed: processedCount
              });
            }
          }
        );
      });
        });
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
  const totalBottles = products.reduce((total, product) => total + (product.ilosc || 0), 0);
  const kurs = aktualnyKurs || 1;
  const kosztDostawyPerUnit = totalBottles > 0 ? parseFloat((((kosztDostawy || 0) / totalBottles) * kurs).toFixed(2)) : 0;
  
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
          for (const product of products) {
            console.log(`📝 Processing product: ${product.kod}`);
            
            // Создаем новую запись в таблице products для каждого продукта
            console.log(`➕ Creating new product record: ${product.kod}`);
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
            
            // Обновляем working_sheets
            console.log(`📝 Processing working_sheets for: ${product.kod}`);
            await new Promise((resolve, reject) => {
              db.get('SELECT * FROM working_sheets WHERE kod = ?', [product.kod], (err, existingProduct) => {
                if (err) {
                  console.error('❌ Error checking working_sheets:', err);
                  reject(err);
                  return;
                }
                
                if (existingProduct) {
                  // Если товар существует - сохраняем снимок ДО изменений, затем обновляем
                  console.log(`📝 Updating existing product: ${product.kod}`);
                  
                  const oldPrice = existingProduct.cena || 0;
                  const newPrice = product.cena || 0;
                  
                  console.log(`💰 Price for ${product.kod}: oldPrice=${oldPrice}, newPrice=${newPrice}`);
                  
                  // 1. Сначала сохраняем снимок ДО изменений в working_sheets_history
                  console.log(`📸 Saving snapshot BEFORE changes for ${product.kod}`);
                  db.run(
                    `INSERT INTO working_sheets_history 
                     (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny, action, receipt_id)
                     SELECT kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny,
                            'before_receipt', ?
                     FROM working_sheets WHERE kod = ?`,
                    [receiptId, product.kod],
                    function(err) {
                      if (err) {
                        console.error(`❌ Error saving snapshot for ${product.kod}:`, err);
                        reject(err);
                        return;
                      }
                      console.log(`✅ Snapshot saved for ${product.kod} (receipt_id: ${receiptId})`);
                      
                      // 2. Затем обновляем working_sheets
                      console.log(`📝 Updating working_sheets for ${product.kod}`);
                      
                      const cenaValue = parseFloat(newPrice) || 0;
                      const objetoscValue = parseFloat(product.objetosc) || 1;
                      const podatekAkcyzowyValue = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                      
                      // Для bezalkoholowe и ferment податок всегда 0
                      const isBezalkoholoweOrFermentUpd = product.typ === 'bezalkoholowe' || product.typ === 'ferment';
                      console.log(`🔍 UPDATE type check for ${product.kod}: typ="${product.typ}", isBezalkoholoweOrFermentUpd=${isBezalkoholoweOrFermentUpd}`);
                      const podatekValueUpd = isBezalkoholoweOrFermentUpd ? 0 :
                        (podatekAkcyzowyValue === 0 ? 0 : parseFloat((podatekAkcyzowyValue * objetoscValue).toFixed(2)));
                      const kosztWlasnyValueUpd = parseFloat((cenaValue * kurs + kosztDostawyPerUnit + podatekValueUpd).toFixed(2));
                      
                      console.log(`📊 UPDATE ${product.kod}:`);
                      console.log(`  - newPrice: ${newPrice} → ${cenaValue}`);
                      console.log(`  - objetosc: ${product.objetosc} → ${objetoscValue}`);
                      console.log(`  - podatekAkcyzowy: ${podatekAkcyzowy} → ${podatekAkcyzowyValue}`);
                      console.log(`  - kosztDostawyPerUnit: ${kosztDostawyPerUnit}`);
                      console.log(`  - podatekValueUpd: ${podatekValueUpd} (forced to 0: ${isBezalkoholoweOrFermentUpd})`);
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
                          product.ilosc, 
                          product.nazwa,
                          product.kod_kreskowy || null,
                          product.typ || null,
                          sprzedawca || null,
                          cenaValue,
                          product.dataWaznosci || null,
                          product.objetosc || null,
                          kosztDostawyPerUnit || 0,
                          podatekValueUpd || 0,
                          kosztWlasnyValueUpd || 0,
                          product.kod
                        ],
                      function(err) {
                        if (err) {
                          console.error('❌ Error updating working_sheets:', err);
                          reject(err);
                        } else {
                        console.log(`✅ Updated working_sheets: ${product.kod}`);
                          workingSheetsUpdated++;
                          resolve();
                        }
                      }
                    );
                    }); // Закрываем функцию сохранения снимка
                  } else {
                  // Если товара нет - создаем новую запись в working_sheets
                  console.log(`➕ Creating new product: ${product.kod}`);
                  const cenaValue = parseFloat(product.cena) || 0;
                  const objetoscValue = parseFloat(product.objetosc) || 1;
                  const podatekAkcyzowyValue = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                  
                  // Для bezalkoholowe и ferment податок всегда 0
                  const isBezalkoholoweOrFerment = product.typ === 'bezalkoholowe' || product.typ === 'ferment';
                  console.log(`🔍 Product type check for ${product.kod}: typ="${product.typ}", isBezalkoholoweOrFerment=${isBezalkoholoweOrFerment}`);
                  const podatekValue = isBezalkoholoweOrFerment ? 0 : 
                    (podatekAkcyzowyValue === 0 ? 0 : parseFloat((podatekAkcyzowyValue * objetoscValue).toFixed(2)));
                  const kosztWlasnyValue = parseFloat((cenaValue * kurs + kosztDostawyPerUnit + podatekValue).toFixed(2));
                  console.log(`💰 Final podatekValue for ${product.kod}: ${podatekValue} (forced to 0: ${isBezalkoholoweOrFerment})`);
                  
                  console.log(`📊 Product ${product.kod}:`);
                  console.log(`  - cena: ${product.cena} → ${cenaValue}`);
                  console.log(`  - objetosc: ${product.objetosc} → ${objetoscValue}`);
                  console.log(`  - podatekAkcyzowy: ${podatekAkcyzowy} → ${podatekAkcyzowyValue}`);
                  console.log(`  - kurs: ${kurs}`);
                  console.log(`  - kosztDostawyPerUnit: ${kosztDostawyPerUnit}`);
                  console.log(`  - podatekValue: ${podatekValue}`);
                  console.log(`  - kosztWlasnyValue: ${kosztWlasnyValue}`);
                  
                  const finalKosztDostawy = kosztDostawyPerUnit || 0;
                  const finalPodatek = podatekValue || 0;
                  const finalKosztWlasny = kosztWlasnyValue || 0;
                  
                  console.log(`🔍 FINAL VALUES for SQL INSERT:`);
                  console.log(`  - koszt_dostawy_per_unit: ${finalKosztDostawy} (type: ${typeof finalKosztDostawy})`);
                  console.log(`  - podatek_akcyzowy: ${finalPodatek} (type: ${typeof finalPodatek})`);
                  console.log(`  - koszt_wlasny: ${finalKosztWlasny} (type: ${typeof finalKosztWlasny})`);
                  
                  db.run(
                    'INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                      product.kod, 
                      product.nazwa, 
                      product.ilosc, 
                      product.kod_kreskowy || null, 
                      product.typ || null, 
                      sprzedawca || null, 
                      cenaValue,
                      product.dataWaznosci || null,
                      product.objetosc || null,
                      finalKosztDostawy,
                      finalPodatek,
                      finalKosztWlasny
                    ],
                    function(err) {
                      if (err) {
                        console.error('❌ Error inserting into working_sheets:', err);
                        reject(err);
                      } else {
                        console.log(`✅ Created new working_sheets record: ${product.kod}`);
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
  
  let date, sprzedawca, wartosc, kosztDostawy, products, productInvoice, transportInvoice, aktualnyKurs, podatekAkcyzowy;
  
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
    
    // Вычисляем курс для обновления записи
    const kurs = aktualnyKurs || 1;
    
    db.run(
      'UPDATE product_receipts SET dataPrzyjecia = ?, sprzedawca = ?, wartosc = ?, kosztDostawy = ?, aktualny_kurs = ?, podatek_akcyzowy = ?, products = ?, productInvoice = ?, transportInvoice = ? WHERE id = ?',
      [date, sprzedawca || '', wartosc || 0, kosztDostawy || 0, kurs, (podatekAkcyzowy || 0), JSON.stringify(products), finalProductInvoice, finalTransportInvoice, id],
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
        
        // Функция для последовательной обработки товаров
        const processProductsSequentially = async () => {
          try {
            // Вычисляем общее количество бутылок для расчета стоимости доставки на единицу
            const totalBottles = products.reduce((total, product) => total + (product.ilosc || 0), 0);
            const kosztDostawyPerUnit = totalBottles > 0 ? ((kosztDostawy || 0) / totalBottles) * kurs : 0;
            
            console.log(`💰 Delivery cost calculation (PUT): ${kosztDostawy || 0}€ / ${totalBottles} bottles * ${kurs} kurs = ${kosztDostawyPerUnit.toFixed(4)} zł per unit`);
            
            // Шаг 1: Удаляем старые записи продуктов из редактируемой приемки
            console.log('🔄 Step 1: Removing old product records from edited receipt...');
            console.log(`📋 Old products to remove: ${oldProducts.map(p => p.kod).join(', ')}`);
            console.log(`📋 New products to keep: ${products.map(p => p.kod).join(', ')}`);
            
            for (const oldProduct of oldProducts) {
              console.log(`🗑️ Processing old product: ${oldProduct.kod} (receipt_id: ${id})`);
              
              // Удаляем запись из products (НЕ трогаем working_sheets здесь!)
              await new Promise((resolve, reject) => {
                db.run('DELETE FROM products WHERE kod = ? AND receipt_id = ?', [oldProduct.kod, id], function(err) {
                  if (err) {
                    console.error(`❌ Error removing old product record ${oldProduct.kod}:`, err);
                    reject(err);
                  } else {
                    console.log(`✅ Removed old product record: ${oldProduct.kod} (receipt_id: ${id}), rows affected: ${this.changes}`);
                    resolve();
                  }
                });
              });
            }
            
            // Шаг 1.5: Проверяем и обновляем working_sheets ПОСЛЕ добавления новых продуктов
            // (перенесем эту логику в конец)
            
                        // Шаг 2: Создаем новые записи в таблице products (working_sheets обновим в Шаге 3)
            console.log('🔄 Step 2: Creating new product records and updating working_sheets...');
            for (const product of products) {
              console.log(`📝 Processing product: ${product.kod}`);
              
              // Обновляем существующую запись в таблице products или создаем новую
              console.log(`📝 Processing product record: ${product.kod}`);
              await new Promise((resolve, reject) => {
                // Сначала проверяем, есть ли уже запись для этого продукта в этой приемке
                db.get('SELECT * FROM products WHERE kod = ? AND receipt_id = ?', [product.kod, id], (err, existingProduct) => {
                  if (err) {
                    console.error('❌ Error checking existing product:', err.message);
                    reject(err);
                    return;
                  }
                  
                  if (existingProduct) {
                    // Если запись существует - обновляем её
                    console.log(`📝 Updating existing product record: ${product.kod}`);
                    db.run(
                      'UPDATE products SET nazwa = ?, kod_kreskowy = ?, cena = ?, ilosc = ? WHERE id = ?',
                      [
                        product.nazwa,
                        product.kod_kreskowy || null,
                        product.cena || 0,
                        product.ilosc,
                        existingProduct.id
                      ],
                      function(err) {
                        if (err) {
                          console.error('❌ Error updating product:', err.message);
                          reject(err);
                        } else {
                                                  console.log(`✅ Updated existing product record: ${product.kod}`);
                        productsUpdated++;
                        resolve();
                        }
                      }
                    );
                  } else {
                    // Если записи нет - создаем новую
                    console.log(`➕ Creating new product record: ${product.kod}`);
                    db.run(
                      'INSERT INTO products (kod, nazwa, kod_kreskowy, cena, ilosc, ilosc_aktualna, receipt_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                      [
                        product.kod, 
                        product.nazwa, 
                        product.kod_kreskowy || null, 
                        product.cena || 0,
                        product.ilosc,
                        product.ilosc, // ilosc_aktualna
                        id,
                        (product.cena || 0) === 0 ? 'samples' : null
                      ],
                      function(err) {
                        if (err) {
                          console.error('❌ Error inserting into products:', err.message);
                          reject(err);
                        } else {
                          console.log(`✅ Created new product record: ${product.kod} with ID: ${this.lastID}`);
                          productsInserted++;
                          resolve();
                        }
                      }
                    );
                  }
                });
              });
              
              // НЕ обновляем working_sheets здесь - это будет сделано в Шаге 3
              console.log(`📝 Product ${product.kod} processed, working_sheets will be updated in Step 3`);
              
              processedCount++;
            }
            
            // Шаг 3: Проверяем и обновляем working_sheets для всех товаров
            console.log('🔄 Step 3: Processing working_sheets after all products updated...');
            
            // Получаем все уникальные коды товаров (старые + новые)
            const allProductCodes = [...new Set([...oldProducts.map(p => p.kod), ...products.map(p => p.kod)])];
            console.log(`📋 All product codes to process: ${allProductCodes.join(', ')}`);
            
            // Проверяем текущее состояние products таблицы
            console.log('🔍 Current state of products table:');
            for (const productCode of allProductCodes) {
              await new Promise((resolve) => {
                db.get('SELECT COUNT(*) as count FROM products WHERE kod = ?', [productCode], (err, result) => {
                  if (err) {
                    console.error(`❌ Error checking products for ${productCode}:`, err);
                  } else {
                    console.log(`  - ${productCode}: found in ${result.count} receipts`);
                  }
                  resolve();
                });
              });
            }
            
            for (const productCode of allProductCodes) {
              console.log(`🔍 Processing working_sheets for: ${productCode}`);
              
              // Проверяем, есть ли товар в products
              await new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count, SUM(ilosc) as total_ilosc FROM products WHERE kod = ?', [productCode], (err, result) => {
                  if (err) {
                    console.error(`❌ Error checking products for ${productCode}:`, err);
                    reject(err);
                    return;
                  }
                  
                  const productCount = result.count || 0;
                  const totalQuantity = result.total_ilosc || 0;
                  console.log(`📊 Product ${productCode}: found in ${productCount} receipts, total quantity: ${totalQuantity}`);
                  
                  if (productCount === 0) {
                    // Товар больше не существует ни в одной приемке - удаляем из working_sheets
                    console.log(`🗑️ Product ${productCode} no longer exists in any receipt, removing from working_sheets`);
                    db.run('DELETE FROM working_sheets WHERE kod = ?', [productCode], function(err) {
                    if (err) {
                        console.error(`❌ Error removing from working_sheets: ${productCode}`, err);
                      reject(err);
                      } else {
                        console.log(`✅ Removed ${productCode} from working_sheets (no more receipts), rows affected: ${this.changes}`);
                        resolve();
                      }
                    });
                  } else {
                    // Товар существует - обновляем или создаем запись в working_sheets
                    console.log(`📝 Product ${productCode} exists in ${productCount} receipts, updating working_sheets`);
                    
                    // Получаем данные из исходного массива products (который пришел в запросе)
                    const sourceProduct = products.find(p => p.kod === productCode);
                    if (!sourceProduct) {
                      console.error(`❌ ERROR: Product ${productCode} not found in source products array`);
                      reject(new Error(`Product ${productCode} not found in source products array`));
                      return;
                    }
                    
                    console.log(`📝 Source product data for ${productCode}:`, {
                      nazwa: sourceProduct.nazwa,
                      typ: sourceProduct.typ,
                      dataWaznosci: sourceProduct.dataWaznosci,
                      objetosc: sourceProduct.objetosc
                    });
                    
                    // Проверяем, есть ли запись в working_sheets
                    db.get('SELECT * FROM working_sheets WHERE kod = ?', [productCode], (err, workingSheetRecord) => {
                      if (err) {
                        console.error(`❌ Error checking working_sheets for ${productCode}:`, err);
                        reject(err);
                        return;
                      }
                      
                      if (workingSheetRecord) {
                        // Сначала сохраняем снимок ДО изменений (если это редактирование существующей приемки)
                        console.log(`📸 Saving snapshot BEFORE changes for ${productCode} (receipt_id: ${id})`);
                        db.run(
                          `INSERT INTO working_sheets_history 
                           (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny, action, receipt_id)
                           SELECT kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny,
                                  'before_receipt', ?
                           FROM working_sheets WHERE kod = ?`,
                          [id, productCode],
                          function(snapshotErr) {
                            if (snapshotErr) {
                              console.error(`❌ Error saving snapshot for ${productCode}:`, snapshotErr);
                              // Продолжаем выполнение даже если снимок не сохранился
                            } else {
                              console.log(`✅ Snapshot saved for ${productCode} (receipt_id: ${id})`);
                            }
                            
                        // Обновляем существующую запись
                        console.log(`📝 Updating existing working_sheets record for ${productCode}`);
                        
                        const cenaValueEdit = parseFloat(sourceProduct.cena) || 0;
                        const objetoscValueEdit = parseFloat(sourceProduct.objetosc) || 1;
                        const podatekAkcyzowyValueEdit = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                        const kosztDostawyPerUnitEdit = parseFloat((((kosztDostawy || 0) / (products.reduce((t, p) => t + (p.ilosc || 0), 0) || 1)) * kurs).toFixed(2));
                        
                        // Для bezalkoholowe и ferment податок всегда 0
                        const isBezalkoholoweOrFermentEdit = sourceProduct.typ === 'bezalkoholowe' || sourceProduct.typ === 'ferment';
                        const podatekValueEdit = isBezalkoholoweOrFermentEdit ? 0 :
                          (podatekAkcyzowyValueEdit === 0 ? 0 : parseFloat((podatekAkcyzowyValueEdit * objetoscValueEdit).toFixed(2)));
                        const kosztWlasnyValueEdit = parseFloat((cenaValueEdit * kurs + kosztDostawyPerUnitEdit + podatekValueEdit).toFixed(2));
                        
                        console.log(`📊 UPDATE EDIT ${productCode}: podatek=${podatekValueEdit}, koszt_wlasny=${kosztWlasnyValueEdit}`);
                        
                        db.run(
                          `UPDATE working_sheets SET 
                            nazwa = ?, ilosc = ?, kod_kreskowy = ?, typ = ?, 
                                sprzedawca = ?, cena = ?, data_waznosci = ?, objetosc = ?, koszt_dostawy_per_unit = ?, podatek_akcyzowy = ?, koszt_wlasny = ?
                          WHERE kod = ?`,
                          [
                            sourceProduct.nazwa,
                            totalQuantity,
                            sourceProduct.kod_kreskowy || null,
                            sourceProduct.typ || null,
                            sprzedawca || null,
                            cenaValueEdit,
                            sourceProduct.dataWaznosci || null,
                            sourceProduct.objetosc || null,
                            kosztDostawyPerUnitEdit,
                            podatekValueEdit,
                            kosztWlasnyValueEdit,
                            productCode
                          ],
                          function(err) {
                            if (err) {
                              console.error(`❌ Error updating working_sheets for ${productCode}:`, err);
                              reject(err);
                            } else {
                              console.log(`✅ Updated working_sheets for ${productCode}, rows affected: ${this.changes}`);
                              workingSheetsUpdated++;
                              resolve();
                            }
                          }
                        );
                          }); // Закрываем функцию сохранения снимка
                      } else {
                        // Создаем новую запись (если товар был удален, но потом добавлен обратно)
                        console.log(`➕ Creating new working_sheets record for ${productCode}`);
                        
                        const cenaValueEditIns = parseFloat(sourceProduct.cena) || 0;
                        const objetoscValueEditIns = parseFloat(sourceProduct.objetosc) || 1;
                        const podatekAkcyzowyValueEditIns = parseFloat(String(podatekAkcyzowy || '0').replace(',', '.'));
                        const kosztDostawyPerUnitEditIns = parseFloat((((kosztDostawy || 0) / (products.reduce((t, p) => t + (p.ilosc || 0), 0) || 1)) * kurs).toFixed(2));
                        
                        // Для bezalkoholowe и ferment податок всегда 0
                        const isBezalkoholoweOrFermentEditIns = sourceProduct.typ === 'bezalkoholowe' || sourceProduct.typ === 'ferment';
                        const podatekValueEditIns = isBezalkoholoweOrFermentEditIns ? 0 :
                          (podatekAkcyzowyValueEditIns === 0 ? 0 : parseFloat((podatekAkcyzowyValueEditIns * objetoscValueEditIns).toFixed(2)));
                        const kosztWlasnyValueEditIns = parseFloat((cenaValueEditIns * kurs + kosztDostawyPerUnitEditIns + podatekValueEditIns).toFixed(2));
                        
                        console.log(`📊 INSERT EDIT ${productCode}: podatek=${podatekValueEditIns}, koszt_wlasny=${kosztWlasnyValueEditIns}`);
                        
                        db.run(
                          `INSERT INTO working_sheets (kod, nazwa, ilosc, kod_kreskowy, typ, sprzedawca, cena, data_waznosci, objetosc, koszt_dostawy_per_unit, podatek_akcyzowy, koszt_wlasny) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                          [
                            productCode,
                            sourceProduct.nazwa,
                            totalQuantity,
                            sourceProduct.kod_kreskowy || null,
                            sourceProduct.typ || null,
                            sprzedawca || null,
                            cenaValueEditIns,
                            sourceProduct.dataWaznosci || null,
                            sourceProduct.objetosc || null,
                            kosztDostawyPerUnitEditIns,
                            podatekValueEditIns,
                            kosztWlasnyValueEditIns
                          ],
                          function(err) {
                            if (err) {
                              console.error(`❌ Error creating working_sheets for ${productCode}:`, err);
                              reject(err);
                            } else {
                              console.log(`✅ Created working_sheets for ${productCode}, rows affected: ${this.changes}`);
                              workingSheetsUpdated++;
                              resolve();
                            }
                          }
                        );
                      }
                    });
                    }
                  });
                });
            }
            
            // Шаг 4: Отправляем ответ
            console.log(`🎉 Update processing complete: ${workingSheetsUpdated} working_sheets updated, ${productsUpdated} products updated, ${productsInserted} products created`);
            
            // Проверяем финальное состояние
            console.log('🔍 Final state check:');
            for (const product of products) {
              console.log(`  - ${product.kod}: should be in products and working_sheets`);
            }
            for (const oldProduct of oldProducts) {
              if (!products.find(p => p.kod === oldProduct.kod)) {
                console.log(`  - ${oldProduct.kod}: should be REMOVED from products and working_sheets`);
              }
            }
            
            res.json({ 
              message: 'Product receipt updated successfully',
              workingSheetsUpdated: workingSheetsUpdated,
              productsUpdated: productsUpdated,
              productsCreated: productsInserted
            });
            
          } catch (error) {
            console.error('❌ Error during product processing:', error);
            res.status(500).json({ error: 'Failed to update working sheets' });
          }
        };
        
        // Запускаем последовательную обработку и ждем завершения
        processProductsSequentially().then(() => {
          console.log('✅ All product processing completed successfully');
        }).catch((error) => {
          console.error('❌ Error during product processing:', error);
          res.status(500).json({ error: 'Failed to update working sheets' });
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
                  // пересчитать количество (и цену)
                  db.get('SELECT SUM(ilosc) as total_ilosc, cena FROM products WHERE kod = ? ORDER BY id DESC LIMIT 1', [product.kod], (sumErr, sumRow) => {
                    if (sumErr) return finalize();
                    const qty = sumRow.total_ilosc || 0;
                    const price = sumRow.cena || 0;
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

// Search working sheets
app.get('/api/working-sheets/search', (req, res) => {
  const { query } = req.query;
  console.log(`🔍 GET /api/working-sheets/search - Searching working sheets with query: "${query}"`);
  
  if (!query) {
    console.log('❌ Validation failed: query parameter is required');
    return res.status(400).json({ error: 'Query parameter is required' });
  }
  
  db.all(`
    WITH ws_products AS (
      SELECT 
        w.kod,
        w.nazwa,
        w.kod_kreskowy,
        w.typ,
        w.ilosc as ilosc_main
      FROM working_sheets w
      WHERE (w.kod LIKE ? OR w.nazwa LIKE ? OR w.kod_kreskowy LIKE ?)
    ),
    samples_products AS (
      SELECT 
        kod, 
        nazwa, 
        SUM(ilosc) as ilosc_samples,
        MAX(kod_kreskowy) as kod_kreskowy,
        MAX(typ) as typ
      FROM products
      WHERE (kod LIKE ? OR nazwa LIKE ? OR kod_kreskowy LIKE ?)
        AND status = 'samples'
      GROUP BY kod
      HAVING SUM(ilosc) > 0
    )
    SELECT 
      ws.kod,
      ws.nazwa,
      COALESCE(ws.ilosc_main, 0) - COALESCE(sp.ilosc_samples, 0) as ilosc,
      ws.kod_kreskowy,
      ws.typ,
      NULL as status
    FROM ws_products ws
    LEFT JOIN samples_products sp ON ws.kod = sp.kod
    WHERE COALESCE(ws.ilosc_main, 0) - COALESCE(sp.ilosc_samples, 0) > 0
    
    UNION ALL
    
    SELECT 
      kod,
      nazwa,
      ilosc_samples as ilosc,
      kod_kreskowy,
      typ,
      'samples' as status
    FROM samples_products
    
    ORDER BY status, nazwa
    LIMIT 50
  `, [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`],
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
app.use(express.static(path.join(__dirname, '..')));

// ВАЖНО: SPA Fallback маршрут ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ!
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../index.html');
  console.log('Serving SPA fallback:', indexPath);
  res.sendFile(indexPath);
});

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

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 EnoTerra ERP Server running on port ${PORT}`);
  console.log(`📂 Serving static files from: ${__dirname}`);
  console.log(`💾 Database located at: ${dbPath}`);
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
            consumptions.push({ batchId: batch.id, qty: take, cena: batch.cena });
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

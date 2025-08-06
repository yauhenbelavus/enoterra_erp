import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import fontkit from '@pdf-lib/fontkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Добавляем middleware для парсинга JSON в самом начале
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Добавляем подробное логирование всех запросов ПОСЛЕ парсинга JSON
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  if (req.method !== 'GET') {
    console.log('Body:', req.body);
  }
  next();
});

// Настраиваем CORS более подробно
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'https://erp.enoterra.pl',
    'https://www.erp.enoterra.pl'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed!'));
  }
});

// Проверяем существование базы данных
const dbPath = path.join(__dirname, 'enoterra_erp.db');
console.log('Database path:', dbPath);

// Открываем базу данных
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    console.error('Database path:', dbPath);
    console.error('Current directory:', __dirname);
    process.exit(1); // Завершаем процесс, если не можем открыть базу
  }
  console.log('Connected to the SQLite database');
  console.log('Database path:', dbPath);
  console.log('Current directory:', __dirname);
  
  // Включаем режим WAL и устанавливаем таймаут
  db.run('PRAGMA journal_mode = WAL', (err) => {
    if (err) {
      console.error('Error setting WAL mode:', err);
      console.error('Error details:', err.message);
    } else {
      console.log('WAL mode enabled');
    }
  });
  
  db.run('PRAGMA busy_timeout = 5000', (err) => {
    if (err) console.error('Error setting busy timeout:', err);
    else console.log('Busy timeout set to 5000ms');
  });

  // Добавляем настройки для лучшей производительности
  db.run('PRAGMA synchronous = NORMAL', (err) => {
    if (err) console.error('Error setting synchronous mode:', err);
    else console.log('Synchronous mode set to NORMAL');
  });

  db.run('PRAGMA cache_size = 2000', (err) => {
    if (err) console.error('Error setting cache size:', err);
    else console.log('Cache size set to 2000 pages');
  });

  db.run('PRAGMA temp_store = MEMORY', (err) => {
    if (err) console.error('Error setting temp store:', err);
    else console.log('Temp store set to MEMORY');
  });
  
  db.run('PRAGMA locking_mode = NORMAL', (err) => {
    if (err) console.error('Error setting locking mode:', err);
    else console.log('Locking mode set to NORMAL');
  });
  
  // Создаем таблицы
  db.serialize(() => {
    // Создаем таблицу clients
    db.run(`CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firma TEXT,
      nazwa TEXT,
      adres TEXT,
      czasDostawy TEXT,
      kontakt TEXT
    )`, (err) => {
      if (err) console.error('Error creating clients table:', err);
      else console.log('Clients table ready');
    });

    // Создаем таблицу products
    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kod TEXT UNIQUE,
      nazwa TEXT,
      jednostka_miary TEXT DEFAULT 'szt',
      kod_kreskowy TEXT,
      data_waznosci INTEGER DEFAULT NULL,
      archiwalny BOOLEAN DEFAULT FALSE,
      waga_netto REAL DEFAULT 0,
      waga_brutto REAL DEFAULT 0,
      objetosc REAL DEFAULT 0,
      opis TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('Error creating products table:', err);
      else console.log('Products table ready');
      
      // Миграция: заменяем 0 на NULL в поле data_waznosci (только если колонка существует)
      db.run("PRAGMA table_info(products)", (err, rows) => {
        if (err) {
          console.error('Error checking products table schema:', err);
          return;
        }
        
        const hasDataWaznosci = rows.some(row => row.name === 'data_waznosci');
        if (hasDataWaznosci) {
          db.run('UPDATE products SET data_waznosci = NULL WHERE data_waznosci = 0', (err) => {
            if (err) {
              console.error('Error migrating products data_waznosci:', err);
            } else {
              console.log('Migration: replaced 0 with NULL in products data_waznosci field');
            }
          });
        } else {
          console.log('data_waznosci column does not exist in products table, skipping migration');
        }
      });
    });

    // Создаем таблицу product_quantities для хранения количества продуктов
    db.run(`CREATE TABLE IF NOT EXISTS product_quantities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_kod TEXT UNIQUE,
      ilosc INTEGER DEFAULT 0,
      rezerwacje INTEGER DEFAULT 0,
      ilosc_na_poleceniach INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_kod) REFERENCES products(kod)
    )`, (err) => {
      if (err) console.error('Error creating product_quantities table:', err);
      else console.log('Product quantities table ready');
    });

    // Создаем таблицу original_sheets
    db.run(`CREATE TABLE IF NOT EXISTS original_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fileName TEXT UNIQUE,
      data TEXT
    )`, (err) => {
      if (err) console.error('Error creating original_sheets table:', err);
      else console.log('Original sheets table ready');
    });

    // Создаем таблицу working_sheets
    db.run(`CREATE TABLE IF NOT EXISTS working_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fileName TEXT,
      kod TEXT,
      nazwa TEXT,
      ilosc INTEGER DEFAULT 0,
      jednostka_miary TEXT DEFAULT 'szt',
      kod_kreskowy TEXT,
      data_waznosci INTEGER DEFAULT NULL,
      archiwalny BOOLEAN DEFAULT FALSE,
      rezerwacje INTEGER DEFAULT 0,
      ilosc_na_poleceniach INTEGER DEFAULT 0,
      waga_netto REAL DEFAULT 0,
      waga_brutto REAL DEFAULT 0,
      objetosc REAL DEFAULT 0,
      typ TEXT,
      opis TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('Error creating working_sheets table:', err);
        return;
      }
      console.log('Working sheets table created');

      // Создаем индекс для быстрого поиска по коду
      db.run('CREATE INDEX IF NOT EXISTS idx_working_sheets_kod ON working_sheets(kod)');
      
      // Миграция: заменяем 0 на NULL в поле data_waznosci
      db.run('UPDATE working_sheets SET data_waznosci = NULL WHERE data_waznosci = 0', (err) => {
        if (err) {
          console.error('Error migrating data_waznosci:', err);
        } else {
          console.log('Migration: replaced 0 with NULL in data_waznosci field');
        }
      });

      // Миграция: добавляем поле typ в таблицу working_sheets
      db.run('ALTER TABLE working_sheets ADD COLUMN typ TEXT', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding typ column to working_sheets:', err);
        } else {
          console.log('Typ column added to working_sheets table (or already exists)');
        }
      });

      // Миграция: добавляем поле sprzedawca в таблицу working_sheets
      db.run('ALTER TABLE working_sheets ADD COLUMN sprzedawca TEXT', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding sprzedawca column to working_sheets:', err);
        } else {
          console.log('Sprzedawca column added to working_sheets table (or already exists)');
        }
      });

      // Миграция: добавляем поле cena в таблицу working_sheets
      db.run('ALTER TABLE working_sheets ADD COLUMN cena REAL', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding cena column to working_sheets:', err);
        } else {
          console.log('Cena column added to working_sheets table (or already exists)');
        }
      });
    });

    // Создаем таблицу product_receipts
    db.run(`CREATE TABLE IF NOT EXISTS product_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataPrzyjecia TEXT,
      sprzedawca TEXT,
      wartosc REAL,
      kosztDostawy REAL,
      products TEXT,
      productInvoice TEXT,
      transportInvoice TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('Error creating product_receipts table:', err);
      else console.log('Product receipts table ready');
    });

    // Удаляем колонку objetosc из таблицы product_receipts, если она существует
    db.run('ALTER TABLE product_receipts DROP COLUMN objetosc', (err) => {
      if (err && !err.message.includes('no such column')) {
        console.error('Error dropping objetosc column from product_receipts:', err);
      } else {
        console.log('Objetosc column removed from product_receipts table (or did not exist)');
      }
    });

    // Создаем таблицу orders
    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klient TEXT,
      numer_zamowienia TEXT,
      data_utworzenia TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      laczna_ilosc INTEGER DEFAULT 0
    )`, (err) => {
      if (err) console.error('Error creating orders table:', err);
      else console.log('Orders table ready');
    });

    // Создаем таблицу order_products
    db.run(`CREATE TABLE IF NOT EXISTS order_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER,
      kod TEXT,
      kod_kreskowy TEXT,
      nazwa TEXT,
      ilosc INTEGER,
      typ TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orderId) REFERENCES orders(id),
      FOREIGN KEY (kod) REFERENCES products(kod)
    )`, (err) => {
      if (err) console.error('Error creating order_products table:', err);
      else console.log('Order products table ready');
    });

    // Создаем таблицу price_history для хранения истории цен
    db.run(`CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      working_sheet_id INTEGER,
      product_kod TEXT,
      sprzedawca TEXT,
      cena REAL,
      ilosc REAL,
      data_dostawy INTEGER,
      is_manual_edit BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (working_sheet_id) REFERENCES working_sheets(id)
    )`, (err) => {
      if (err) console.error('Error creating price_history table:', err);
      else console.log('Price history table ready');
    });

    // Добавляем колонку is_manual_edit в существующую таблицу price_history
    db.run('ALTER TABLE price_history ADD COLUMN is_manual_edit BOOLEAN DEFAULT FALSE', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding is_manual_edit column to price_history:', err);
      } else {
        console.log('is_manual_edit column added to price_history table (or already exists)');
      }
    });

    // Добавляем поле typ в существующую таблицу order_products, если его нет
    db.run('ALTER TABLE order_products ADD COLUMN typ TEXT', (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding typ column to order_products:', err);
      } else {
        console.log('Typ column added to order_products table (or already exists)');
      }
    });

    // Проверяем наличие файла stany init.xlsx при запуске
    db.get('SELECT * FROM original_sheets WHERE fileName = ?', ['stany init.xlsx'], (err, row) => {
      if (err) {
        console.error('Error checking stany init.xlsx:', err);
      } else {
        if (row) {
          console.log('Found stany init.xlsx in database');
        } else {
          console.log('stany init.xlsx not found in database');
        }
      }
    });
  });
});

// Endpoint для поиска клиентов
app.get('/api/clients/search', (req, res) => {
  const searchQuery = `%${req.query.q || ''}%`;
  console.log('Searching with pattern:', searchQuery);
  
  db.all('SELECT id, firma, nazwa, adres, kontakt FROM clients WHERE firma LIKE ? OR nazwa LIKE ? LIMIT 10', [searchQuery, searchQuery], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log('Search results:', rows);
    res.json(rows);
  });
});

// Пример endpoint
app.get('/clients', (req, res) => {
  db.all('SELECT * FROM clients', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/clients', (req, res) => {
  const { firma, nazwa, adres, czasDostawy, kontakt } = req.body;
  db.run('INSERT INTO clients (firma, nazwa, adres, czasDostawy, kontakt) VALUES (?, ?, ?, ?, ?)', [firma, nazwa, adres, czasDostawy, kontakt], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID });
  });
});

app.delete('/clients/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM clients WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    res.json({ message: 'Client deleted successfully' });
  });
});

app.put('/clients/:id', (req, res) => {
  const { id } = req.params;
  const { firma, nazwa, adres, czasDostawy, kontakt } = req.body;
  db.run('UPDATE clients SET firma = ?, nazwa = ?, adres = ?, czasDostawy = ?, kontakt = ? WHERE id = ?', 
    [firma, nazwa, adres, czasDostawy, kontakt, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    res.json({ message: 'Client updated successfully' });
  });
});

// Функция для обработки данных из original_sheets в working_sheets
function processOriginalSheet(fileName) {
    return new Promise((resolve, reject) => {
        // Get data from original_sheets for the specified file
        const row = db.get('SELECT * FROM original_sheets WHERE fileName = ?', [fileName], (err, row) => {
            if (err) {
                console.error('Error getting data from original_sheets:', err);
                reject(err);
                return;
            }
            if (row) {
                try {
                    const data = JSON.parse(row.data);
                    const headers = data.headers;
                    console.log('Headers from file:', headers);

                    // Find column indexes
                    const kodIndex = headers.findIndex(h => h === 'Kod');
                    const nazwaIndex = headers.findIndex(h => h === 'Nazwa');
                    const iloscIndex = headers.findIndex(h => h === 'Ilość') || 6;
                    const jednostkaIndex = headers.findIndex(h => h === 'Jednostka miary');
                    const kodKreskowyIndex = headers.findIndex(h => h === 'Kod kreskowy');
                    const dataWaznosciIndex = headers.findIndex(h => h === 'Data ważności [dni]');
                    const archiwalnyIndex = headers.findIndex(h => h === 'Archiwalny');
                    const rezerwacjeIndex = headers.findIndex(h => h === 'Rezerwacje');
                    const iloscNaPoleceniachIndex = headers.findIndex(h => h === 'Ilość na poleceniach wydania');
                    const wagaNettoIndex = headers.findIndex(h => h === 'Waga_netto');
                    const wagaBruttoIndex = headers.findIndex(h => h === 'Waga_brutto');
                    const objetoscIndex = headers.findIndex(h => h === 'Objetosc');
                    const opisIndex = headers.findIndex(h => h === 'Opis');

                    console.log('Found column indexes:', {
                        kodIndex,
                        nazwaIndex,
                        iloscIndex,
                        jednostkaIndex,
                        kodKreskowyIndex,
                        dataWaznosciIndex,
                        archiwalnyIndex,
                        rezerwacjeIndex,
                        iloscNaPoleceniachIndex,
                        wagaNettoIndex,
                        wagaBruttoIndex,
                        objetoscIndex,
                        opisIndex
                    });

                    // Begin transaction
                    db.run('BEGIN TRANSACTION');

                    // First, delete existing records for this file
                    db.run('DELETE FROM working_sheets WHERE fileName = ?', [fileName]);

                    // Prepare statement for inserting data
                    const stmt = db.run(`
                        INSERT INTO working_sheets (
                            fileName, kod, nazwa, ilosc, jednostka_miary, kod_kreskowy,
                            data_waznosci, archiwalny, rezerwacje, ilosc_na_poleceniach,
                            waga_netto, waga_brutto, objetosc, opis
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        fileName,
                        data.rows[0][kodIndex],
                        data.rows[0][nazwaIndex] || '',
                        parseInt(data.rows[0][iloscIndex]) || 0,
                        data.rows[0][jednostkaIndex] || 'szt',
                        data.rows[0][kodKreskowyIndex] || '',
                        parseInt(data.rows[0][dataWaznosciIndex]) || null,
                        data.rows[0][archiwalnyIndex] === 'True',
                        parseInt(data.rows[0][rezerwacjeIndex]) || 0,
                        parseInt(data.rows[0][iloscNaPoleceniachIndex]) || 0,
                        parseFloat(data.rows[0][wagaNettoIndex]) || 0,
                        parseFloat(data.rows[0][wagaBruttoIndex]) || 0,
                        parseFloat(data.rows[0][objetoscIndex]) || 0,
                        data.rows[0][opisIndex] || ''
                    ]);

                    try {
                        // Insert each product row
                        data.rows.forEach(dataRow => {
                            const kod = dataRow[kodIndex];
                            if (!kod) return; // Skip rows without product code

                            stmt.run(
                                fileName,
                                kod,
                                dataRow[nazwaIndex] || '',
                                parseInt(dataRow[iloscIndex]) || 0,
                                dataRow[jednostkaIndex] || 'szt',
                                dataRow[kodKreskowyIndex] || '',
                                parseInt(dataRow[dataWaznosciIndex]) || null,
                                dataRow[archiwalnyIndex] === 'True',
                                parseInt(dataRow[rezerwacjeIndex]) || 0,
                                parseInt(dataRow[iloscNaPoleceniachIndex]) || 0,
                                parseFloat(dataRow[wagaNettoIndex]) || 0,
                                parseFloat(dataRow[wagaBruttoIndex]) || 0,
                                parseFloat(dataRow[objetoscIndex]) || 0,
                                dataRow[opisIndex] || ''
                            );
                        });

                        stmt.finalize();

                        // Commit transaction
                        db.run('COMMIT');
                        resolve();

                    } catch (error) {
                        console.error('Error processing data:', error);
                        db.run('ROLLBACK');
                        stmt.finalize();
                        reject(error);
                    }
                } catch (error) {
                    console.error('Error parsing JSON:', error);
                    reject(error);
                }
            } else {
                console.error('File not found in original_sheets:', fileName);
                reject(new Error('File not found'));
            }
        });
    });
}

// Endpoint для загрузки Excel-данных
app.post('/sheets', (req, res) => {
  console.log('=== Начало обработки загрузки файла ===');
  console.log('Headers запроса:', req.headers);
  console.log('Body запроса:', JSON.stringify(req.body, null, 2));
  
  const { fileName, data } = req.body;
  console.log('Получен файл:', fileName);
  
  if (!data || !data.headers || !data.rows) {
    console.error('Ошибка: неверный формат данных');
    res.status(400).json({ error: 'Неверный формат данных' });
    return;
  }

  // Преобразуем данные в JSON строку
  const dataStr = JSON.stringify(data);
  console.log('Данные преобразованы в строку, длина:', dataStr.length);

  // Начинаем транзакцию
  db.run('BEGIN TRANSACTION');

  // Проверяем существование файла в original_sheets
  const row = db.get('SELECT id FROM original_sheets WHERE fileName = ?', [fileName], (err, row) => {
    if (err) {
      console.error('Error checking file existence:', err);
      res.status(500).json({ error: 'Error checking file existence' });
      return;
    }
    if (row) {
      // Если файл существует в original_sheets, обновляем его
      db.run('INSERT OR REPLACE INTO original_sheets (id, fileName, data) VALUES (?, ?, ?)', row.id, fileName, dataStr);
      console.log('Обновлено в original_sheets, ID:', row.id);
      processUpdate();
    } else {
      // Если файл не существует в original_sheets, создаем новую запись
      db.run('INSERT INTO original_sheets (fileName, data) VALUES (?, ?)', fileName, dataStr);
      console.log('Вставлено в original_sheets, ID:', this.lastID);
      processUpdate();
    }
  });

  function processUpdate() {
    // Проверяем, что данные сохранились
    const row = db.get('SELECT * FROM original_sheets WHERE fileName = ?', [fileName], (err, row) => {
      if (err) {
        console.error('Error checking saved data:', err);
        db.run('ROLLBACK');
        res.status(500).json({ error: 'Error checking saved data' });
        return;
      }
      if (row) {
        console.log('Сохраненные данные:', {
          id: row.id,
          fileName: row.fileName,
          dataLength: row.data.length
        });

        try {
          const savedData = JSON.parse(row.data);
          console.log('Данные успешно сохранены и могут быть прочитаны');
          console.log('Количество заголовков:', savedData.headers.length);
          console.log('Количество строк:', savedData.rows.length);

          // Фиксируем транзакцию
          db.run('COMMIT');

          // Обрабатываем данные и сохраняем в working_sheets
          processOriginalSheet(fileName)
            .then(() => {
              console.log('Данные обработаны и сохранены в working_sheets');
              res.json({ status: 'success' });
            })
            .catch(error => {
              console.error('Ошибка обработки файла:', error);
              res.status(500).json({ error: error.message });
            });
        } catch (error) {
          console.error('Ошибка чтения сохраненных данных:', error);
          db.run('ROLLBACK');
          res.status(500).json({ error: 'Ошибка чтения сохраненных данных' });
        }
      } else {
        console.error('Данные не найдены после сохранения');
        db.run('ROLLBACK');
        res.status(500).json({ error: 'Данные не найдены после сохранения' });
      }
    });
  }
});

// Добавляем healthcheck endpoint для Railway
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Enoterra ERP Backend is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Health check passed',
    timestamp: new Date().toISOString()
  });
});

// Модифицируем endpoint для получения рабочих листов
app.get('/working_sheets', (req, res) => {
  console.log('=== Запрос на получение рабочих листов ===');
  const fileName = req.query.fileName;
  console.log('Запрошенный файл:', fileName);

  let query = 'SELECT * FROM working_sheets';
  let params = [];

  if (fileName) {
    query += ' WHERE fileName = ?';
    params.push(fileName);
  }

  query += ' ORDER BY fileName, kod';

  console.log('SQL запрос:', query);
  console.log('Параметры:', params);

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Ошибка получения рабочих листов:', err);
      return res.status(500).json({ error: err.message });
    }

    if (!rows || rows.length === 0) {
      console.log('Рабочие листы не найдены');
      return res.json([]);
    }

    console.log(`Найдено ${rows.length} рабочих листов`);
    console.log('Пример данных:', rows[0]);
    res.json(rows);
  });
});

// Endpoint для получения оригиналов
app.get('/api/original-sheets', (req, res) => {
  console.log('=== Запрос на получение оригинальных листов ===');
  
  db.all('SELECT * FROM original_sheets', [], (err, rows) => {
    if (err) {
      console.error('Ошибка получения оригинальных листов:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    if (!rows || rows.length === 0) {
      console.log('Оригинальные листы не найдены');
      return res.json([]);
    }

    console.log(`Найдено ${rows.length} оригинальных листов`);
    const processedRows = rows.map(row => ({
      ...row,
      data: row.data ? JSON.parse(row.data) : null
    }));
    res.json(processedRows);
  });
});

app.delete('/delete_stany_init', (req, res) => {
  db.run('DELETE FROM original_sheets WHERE fileName = ?', ['stany.init'], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    db.run('DELETE FROM working_sheets WHERE fileName = ?', ['stany.init'], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ status: 'deleted' });
    });
  });
});

app.get('/check_file/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  console.log('Checking file:', fileName);
  
  // Проверяем только в original_sheets
  db.get('SELECT * FROM original_sheets WHERE fileName = ?', [fileName], (err, row) => {
    if (err) {
      console.error('Error checking file:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log('File check result:', row ? 'exists' : 'not found');
    res.json({ exists: !!row });
  });
});

app.get('/list_all_files', (req, res) => {
  db.all('SELECT fileName FROM original_sheets', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/clear_database', (req, res) => {
  // Очищаем все таблицы и делаем это последовательно
  db.run('DELETE FROM original_sheets WHERE fileName = ?', ['stany.init'], (err) => {
    if (err) {
      console.error('Error clearing original_sheets:', err);
    }
    
    db.run('DELETE FROM working_sheets WHERE fileName = ?', ['stany.init'], (err) => {
      if (err) {
        console.error('Error clearing working_sheets:', err);
      }

      // Проверяем, что файлы действительно удалены
      db.all('SELECT * FROM original_sheets', [], (err, rows) => {
        if (err) {
          console.error('Error checking sheets:', err);
          res.status(500).json({ error: 'Database error' });
          return;
        }
        console.log('Remaining files:', rows);
        res.json({ 
          message: 'Database cleared successfully',
          remainingFiles: rows 
        });
      });
    });
  });
});

// Endpoint для проверки содержимого таблиц
app.get('/debug/tables', (req, res) => {
  db.serialize(() => {
    db.all('SELECT * FROM original_sheets', [], (err, original) => {
      if (err) {
        console.error('Error reading original_sheets:', err);
      }
      db.all('SELECT * FROM working_sheets', [], (err, working) => {
        if (err) {
          console.error('Error reading working_sheets:', err);
        }
        res.json({
          original_sheets: original || [],
          working_sheets: working || []
        });
      });
    });
  });
});

app.delete('/delete_file/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  console.log('Deleting file:', fileName);
  
  // Удаляем только из original_sheets
  db.run('DELETE FROM original_sheets WHERE fileName = ?', [fileName], (err) => {
    if (err) {
      console.error('Error deleting from original_sheets:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`File ${fileName} deleted from original_sheets`);
    res.json({ status: 'success', message: 'Plik został pomyślnie usunięty' });
  });
});

// Тестовый endpoint для проверки данных
app.get('/test_data', (req, res) => {
  console.log('=== Проверка данных в таблице working_sheets ===');
  
  // Проверяем структуру таблицы
  const columns = db.all('PRAGMA table_info(working_sheets)');
  console.log('Структура таблицы:', columns);

  // Проверяем количество записей
  const row = db.get('SELECT COUNT(*) as count FROM working_sheets');
  console.log('Количество записей:', row.count);

  // Получаем несколько записей для проверки
  const rows = db.all('SELECT * FROM working_sheets LIMIT 5');
  console.log('Пример записей:', rows);
  res.json({
    tableStructure: columns,
    totalRecords: row.count,
    sampleRecords: rows
  });
});

// Endpoint для поиска по данным в working_sheets
app.get('/api/products/search', (req, res) => {
  const { query } = req.query;
  console.log('Search query:', query);

  if (!query) {
    return res.json([]);
  }

  // Сначала проверим, есть ли данные в таблице
  db.get('SELECT COUNT(*) as count FROM working_sheets', [], (err, row) => {
    if (err) {
      console.error('Ошибка проверки данных:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    console.log('Количество записей в таблице:', row.count);

    if (row.count === 0) {
      console.log('Таблица пуста');
      return res.json([]);
    }

    // Формируем запрос для поиска
    const searchPattern = `%${query}%`;
    const searchQuery = `
      SELECT DISTINCT kod, nazwa, ilosc, jednostka_miary, kod_kreskowy
      FROM working_sheets 
      WHERE kod LIKE ? OR nazwa LIKE ? OR kod_kreskowy LIKE ?
      ORDER BY nazwa
      LIMIT 20
    `;
    const params = [searchPattern, searchPattern, searchPattern];

    console.log('Параметры поиска:', params);

    db.all(searchQuery, params, (err, rows) => {
      if (err) {
        console.error('Ошибка поиска продуктов:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      console.log(`Найдено ${rows.length} продуктов`);
      
      // Преобразуем результаты в нужный формат
      const products = rows.map(row => ({
        kod: row.kod,
        nazwa: row.nazwa,
        ilosc: row.ilosc.toString(),
        jednostka: row.jednostka_miary || 'szt.',
        kod_kreskowy: row.kod_kreskowy || '',
        kodKreskowy: row.kod_kreskowy || ''
      }));

      // Удаляем дубликаты по коду продукта
      const uniqueProducts = Array.from(
        new Map(products.map(item => [item.kod, item])).values()
      );
      
      console.log(`Возвращаем ${uniqueProducts.length} уникальных продуктов`);
      if (uniqueProducts.length > 0) {
        console.log('Пример продуктов:', uniqueProducts.slice(0, 3));
      }
      res.json(uniqueProducts);
    });
  });
});

// Новый эндпоинт для загрузки приёмки с PDF-файлами
app.post('/api/product-receipts', upload.fields([
  { name: 'productInvoice', maxCount: 1 },
  { name: 'transportInvoice', maxCount: 1 }
]), (req, res) => {
  let data;
  try {
    if (req.body && req.body.data) {
      // multipart/form-data или JSON с полем data
      if (typeof req.body.data === 'string') {
        data = JSON.parse(req.body.data);
      } else {
        data = req.body.data;
      }
    } else if (req.body && Object.keys(req.body).length > 0) {
      // application/json без поля data (для обратной совместимости)
      data = req.body;
    } else {
      return res.status(400).json({ error: 'Нет данных для приёмки' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Ошибка парсинга данных' });
  }
  if (!data) {
    return res.status(400).json({ error: 'Пустые данные для приёмки' });
  }
  const { date, sprzedawca, wartosc, kosztDostawy, products } = data;
  const productInvoice = req.files?.productInvoice?.[0]?.filename ? `/uploads/${req.files.productInvoice[0].filename}` : null;
  const transportInvoice = req.files?.transportInvoice?.[0]?.filename ? `/uploads/${req.files.transportInvoice[0].filename}` : null;
  
  console.log('Extracted fields:');
  console.log('- date:', date);
  console.log('- sprzedawca:', sprzedawca);
  console.log('- wartosc:', wartosc);
  console.log('- kosztDostawy:', kosztDostawy);
  console.log('- products:', products);
  console.log('- products type:', typeof products);
  console.log('- products is array:', Array.isArray(products));
  console.log('- productInvoice:', productInvoice);
  console.log('- transportInvoice:', transportInvoice);
  
  if (!date || !sprzedawca || !products || !Array.isArray(products)) {
    console.log('Validation failed:');
    console.log('- !date:', !date);
    console.log('- !sprzedawca:', !sprzedawca);
    console.log('- !products:', !products);
    console.log('- !Array.isArray(products):', !Array.isArray(products));
    res.status(400).json({ error: 'Invalid data format' });
    return;
  }

  // Используем objetosc из каждого продукта
  const productsWithObjetosc = products.map(product => ({
    ...product,
    objetosc: product.objetosc || null
  }));

  // Логируем параметры перед вставкой
  console.log('Перед вставкой в product_receipts:', {
    date, sprzedawca, wartosc, kosztDostawy, productsWithObjetosc, productInvoice, transportInvoice
  });
  
          db.run('INSERT INTO product_receipts (dataPrzyjecia, sprzedawca, wartosc, kosztDostawy, products, productInvoice, transportInvoice) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [date, sprzedawca, wartosc, kosztDostawy, JSON.stringify(productsWithObjetosc), productInvoice, transportInvoice], 
    function(err) {
      if (err) {
        console.error('Ошибка при вставке в product_receipts:', err);
        res.status(500).json({ error: 'Ошибка при сохранении приёмки' });
        return;
      }

      const receiptId = this.lastID;
      console.log('✅ Успешно вставлено в product_receipts, ID:', receiptId);

      // --- ВОССТАНАВЛИВАЮ ДОБАВЛЕНИЕ В working_sheets ---
      const updatePromises = productsWithObjetosc.map(product => {
        return new Promise((resolve, reject) => {
          console.log('🔄 Обрабатываем продукт:', product.kod);
          console.log('📋 Данные продукта:', product);
          console.log('📅 Срок годности:', product.dataWaznosci);
          console.log('🏷️ Тип товара:', product.typ);
          
          db.get('SELECT * FROM working_sheets WHERE kod = ?', [product.kod], (err, row) => {
            if (err) {
              console.error('❌ Error getting product:', err);
              reject(err);
              return;
            }
            if (row) {
              // Обновляем количество
              const newQuantity = row.ilosc + parseInt(product.ilosc);
              console.log(`📦 Обновляем продукт ${product.kod}: ${row.ilosc} + ${product.ilosc} = ${newQuantity}`);
              
              // Конвертируем дату в timestamp для сохранения в БД
              let dataWaznosci = null; // По умолчанию NULL
              if (product.dataWaznosci) {
                const date = new Date(product.dataWaznosci);
                dataWaznosci = Math.floor(date.getTime() / 1000); // Конвертируем в Unix timestamp
                console.log(`📅 Обновляем срок годности для ${product.kod}: ${product.dataWaznosci} -> ${dataWaznosci} (timestamp)`);
              }
              
              db.run('UPDATE working_sheets SET ilosc = ?, nazwa = ?, kod_kreskowy = ?, data_waznosci = ?, typ = ?, objetosc = ?, cena = ?, updated_at = CURRENT_TIMESTAMP WHERE kod = ?',
                [newQuantity, product.nazwa, product.kod_kreskowy || '', dataWaznosci, product.typ || null, parseFloat(product.objetosc) || 0, product.cena || null, product.kod], (err) => {
                  if (err) {
                    console.error('❌ Error updating product:', err);
                    reject(err);
                  } else {
                    console.log(`✅ Продукт ${product.kod} обновлен`);
                    
                    // Создаем запись в price_history
                    db.run('INSERT INTO price_history (working_sheet_id, product_kod, sprzedawca, cena, ilosc, data_dostawy) VALUES (?, ?, ?, ?, ?, ?)',
                      [row.id, product.kod, sprzedawca, product.cena || null, product.ilosc, dataWaznosci], (err) => {
                        if (err) {
                          console.error('❌ Error creating price history:', err);
                        } else {
                          console.log(`✅ Price history created for ${product.kod}`);
                        }
                      });
                    
                    resolve();
                  }
                }
              );
            } else {
              // Создаём новую запись
              console.log(`🆕 Создаем новый продукт: ${product.kod}`);
              // Конвертируем дату в timestamp для сохранения в БД
              let dataWaznosci = null;
                if (product.dataWaznosci) {
                const date = new Date(product.dataWaznosci);
                dataWaznosci = Math.floor(date.getTime() / 1000); // Конвертируем в Unix timestamp
                console.log(`📅 Устанавливаем срок годности для ${product.kod}: ${product.dataWaznosci} -> ${dataWaznosci} (timestamp)`);
              }
              
              db.run(`INSERT INTO working_sheets (
                fileName, kod, nazwa, ilosc, jednostka_miary, kod_kreskowy,
                data_waznosci, archiwalny, rezerwacje, ilosc_na_poleceniach,
                waga_netto, waga_brutto, objetosc, opis, typ, cena
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ['manual', product.kod, product.nazwa, parseInt(product.ilosc) || 0, 'szt', product.kod_kreskowy || '', dataWaznosci, false, 0, 0, 0, 0, product.objetosc || 0, '', product.typ || null, product.cena || null], 
                (err) => {
                  if (err) {
                    console.error('❌ Error creating product:', err);
                    reject(err);
                  } else {
                    console.log(`✅ Новый продукт ${product.kod} создан`);
                    
                    // Создаем запись в price_history для нового товара
                    const workingSheetId = this.lastID;
                    db.run('INSERT INTO price_history (working_sheet_id, product_kod, sprzedawca, cena, ilosc, data_dostawy) VALUES (?, ?, ?, ?, ?, ?)',
                      [workingSheetId, product.kod, sprzedawca, product.cena || null, product.ilosc, dataWaznosci], (err) => {
                        if (err) {
                          console.error('❌ Error creating price history for new product:', err);
                        } else {
                          console.log(`✅ Price history created for new product ${product.kod}`);
                        }
                      });
                    
                    resolve();
                  }
                }
              );
            }
          });
        });
      });
      
      Promise.all(updatePromises)
        .then(() => {
          console.log('✅ Все продукты успешно обработаны');
          res.json({ success: true, id: receiptId });
        })
        .catch(error => {
          console.error('❌ Ошибка при обновлении working_sheets:', error);
          res.status(500).json({ error: 'Ошибка при обновлении склада' });
        });
      // --- КОНЕЦ ВОССТАНОВЛЕНИЯ ---
  
    }
  );
});

app.get('/api/product-receipts', (req, res) => {
  db.all('SELECT * FROM product_receipts ORDER BY dataPrzyjecia DESC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching product receipts:', err);
      res.status(50).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Добавляем эндпоинт для удаления записи о приходе товара
app.delete('/api/product-receipts/:id', (req, res) => {
  const receiptId = req.params.id;
  
  // Начинаем транзакцию
  db.run('BEGIN TRANSACTION');

  try {
    // Получаем данные о записи перед удалением
    const row = db.get('SELECT products FROM product_receipts WHERE id = ?', [receiptId], (err, row) => {
      if (err) {
        db.run('ROLLBACK');
        res.status(404).json({ error: 'Receipt not found' });
        return;
      }
      if (!row) {
        db.run('ROLLBACK');
        res.status(404).json({ error: 'Receipt not found' });
        return;
      }

      try {
        // Парсим JSON с продуктами
        const products = JSON.parse(row.products);
        
        // Обновляем количество для каждого продукта в working_sheets
        const updatePromises = products.map(product => {
          return new Promise((resolve, reject) => {
            const existingRow = db.get('SELECT ilosc FROM working_sheets WHERE kod = ?', [product.kod], (err, existingRow) => {
              if (err) {
                console.error('Error getting product:', err);
                reject(err);
                return;
              }
              if (existingRow) {
                // Вычитаем количество из существующего продукта
                const newQuantity = existingRow.ilosc - parseInt(product.ilosc);
                // Если количество стало 0 или меньше, удаляем запись
                if (newQuantity <= 0) {
                  db.run('DELETE FROM working_sheets WHERE kod = ?', [product.kod]);
                } else {
                  db.run('UPDATE working_sheets SET ilosc = ?, updated_at = CURRENT_TIMESTAMP WHERE kod = ?',
                    newQuantity, product.kod
                  );
                }
              }
              resolve();
            });
          });
        });

        // Выполняем все обновления
        Promise.all(updatePromises)
          .then(() => {
            // Удаляем запись из product_receipts
            db.run('DELETE FROM product_receipts WHERE id = ?', [receiptId]);

            // Фиксируем транзакцию
            db.run('COMMIT');
            res.json({ success: true });
          })
          .catch(error => {
            console.error('Error updating products:', error);
            db.run('ROLLBACK');
            res.status(500).json({ error: error.message });
          });
      } catch (error) {
        console.error('Error processing products:', error);
        db.run('ROLLBACK');
        res.status(500).json({ error: error.message });
      }
    });
  } catch (error) {
    console.error('Error processing delete request:', error);
    db.run('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// Добавляем эндпоинт для обновления записи о приходе товара
app.put('/api/product-receipts/:id', upload.fields([
  { name: 'productInvoice', maxCount: 1 },
  { name: 'transportInvoice', maxCount: 1 }
]), (req, res) => {
  const receiptId = req.params.id;
  
  console.log('=== UPDATE RECEIPT DEBUG ===');
  console.log('Receipt ID:', receiptId);
  console.log('Request body:', req.body);
  console.log('Request files:', req.files);
  console.log('Content-Type:', req.headers['content-type']);
  
  let data;
  try {
    if (req.body && req.body.data) {
      // multipart/form-data или JSON с полем data
      console.log('Found data field:', req.body.data);
      console.log('Data field type:', typeof req.body.data);
      if (typeof req.body.data === 'string') {
        data = JSON.parse(req.body.data);
        console.log('Parsed data from string:', data);
      } else {
        data = req.body.data;
        console.log('Using data object directly:', data);
      }
    } else if (req.body && Object.keys(req.body).length > 0) {
      // application/json без поля data (для обратной совместимости)
      console.log('Using req.body directly:', req.body);
      data = req.body;
    } else {
      console.log('No data found in request');
      return res.status(400).json({ error: 'Нет данных для обновления приёмки' });
    }
  } catch (e) {
    console.log('Error parsing data:', e);
    return res.status(400).json({ error: 'Ошибка парсинга данных' });
  }
  
  console.log('Final data object:', data);
  
  if (!data) {
    console.log('Data is null/undefined');
    return res.status(400).json({ error: 'Пустые данные для обновления приёмки' });
  }
  
  const { date, sprzedawca, wartosc, kosztDostawy, products } = data;
  const productInvoice = req.files?.productInvoice?.[0]?.filename ? `/uploads/${req.files.productInvoice[0].filename}` : null;
  const transportInvoice = req.files?.transportInvoice?.[0]?.filename ? `/uploads/${req.files.transportInvoice[0].filename}` : null;
  
  console.log('Extracted fields:');
  console.log('- date:', date);
  console.log('- sprzedawca:', sprzedawca);
  console.log('- wartosc:', wartosc);
  console.log('- kosztDostawy:', kosztDostawy);
  console.log('- products:', products);
  console.log('- products type:', typeof products);
  console.log('- products is array:', Array.isArray(products));
  console.log('- productInvoice:', productInvoice);
  console.log('- transportInvoice:', transportInvoice);
  
  if (!date || !sprzedawca || !products || !Array.isArray(products)) {
    console.log('Validation failed:');
    console.log('- !date:', !date);
    console.log('- !sprzedawca:', !sprzedawca);
    console.log('- !products:', !products);
    console.log('- !Array.isArray(products):', !Array.isArray(products));
    res.status(400).json({ error: 'Invalid data format' });
    return;
  }

  // Начинаем транзакцию
  db.run('BEGIN TRANSACTION');

  try {
    // Получаем старые данные о записи
    const oldRow = db.get('SELECT products FROM product_receipts WHERE id = ?', [receiptId], (err, oldRow) => {
      if (err) {
        db.run('ROLLBACK');
        res.status(404).json({ error: 'Receipt not found' });
        return;
      }
      if (!oldRow) {
        db.run('ROLLBACK');
        res.status(404).json({ error: 'Receipt not found' });
        return;
      }

      try {
        const oldProducts = JSON.parse(oldRow.products);
        
        // Сначала отменяем старые изменения
        const revertPromises = oldProducts.map(product => {
          return new Promise((resolve, reject) => {
            const existingRow = db.get('SELECT * FROM working_sheets WHERE kod = ?', [product.kod], (err, existingRow) => {
              if (err) {
                console.error('Error getting product:', err);
                reject(err);
                return;
              }
              if (existingRow) {
                const newQuantity = existingRow.ilosc - parseInt(product.ilosc);
                if (newQuantity <= 0) {
                  // Если количество стало 0 или меньше, удаляем запись
                  db.run('DELETE FROM working_sheets WHERE kod = ?', [product.kod]);
                } else {
                  // Восстанавливаем оригинальные значения полей
                  db.run('UPDATE working_sheets SET ilosc = ?, nazwa = ?, kod_kreskowy = ?, objetosc = ?, updated_at = CURRENT_TIMESTAMP WHERE kod = ?',
                    newQuantity, product.nazwa, product.kod_kreskowy || '', product.objetosc || 0, product.kod
                  );
                }
              }
              resolve();
            });
          });
        });

        // После отмены старых изменений применяем новые
        Promise.all(revertPromises)
          .then(() => {
            // Обновляем запись в product_receipts
                    const updateQuery = productInvoice || transportInvoice
          ? 'UPDATE product_receipts SET dataPrzyjecia = ?, sprzedawca = ?, wartosc = ?, kosztDostawy = ?, products = ?, productInvoice = COALESCE(?, productInvoice), transportInvoice = COALESCE(?, transportInvoice) WHERE id = ?'
          : 'UPDATE product_receipts SET dataPrzyjecia = ?, sprzedawca = ?, wartosc = ?, kosztDostawy = ?, products = ? WHERE id = ?';
        
        const updateParams = productInvoice || transportInvoice
          ? [date, sprzedawca, wartosc, kosztDostawy, JSON.stringify(products), productInvoice, transportInvoice, receiptId]
          : [date, sprzedawca, wartosc, kosztDostawy, JSON.stringify(products), receiptId];

            db.run(updateQuery, ...updateParams);

            // Применяем новые изменения
            const updatePromises = products.map(product => {
              return new Promise((resolve, reject) => {
                const existingRow = db.get('SELECT * FROM working_sheets WHERE kod = ?', [product.kod], (err, existingRow) => {
                  if (err) {
                    console.error('Error getting product:', err);
                    reject(err);
                    return;
                  }
                  if (existingRow) {
                    // Обновляем существующий продукт
                    const newQuantity = existingRow.ilosc + parseInt(product.ilosc);
                    
                    // Конвертируем дату в timestamp для сохранения в БД
                    let dataWaznosci = null;
                    if (product.dataWaznosci) {
                      const date = new Date(product.dataWaznosci);
                      dataWaznosci = Math.floor(date.getTime() / 1000); // Конвертируем в Unix timestamp
                    }
                    
                    db.run('UPDATE working_sheets SET ilosc = ?, nazwa = ?, kod_kreskowy = ?, data_waznosci = ?, objetosc = ?, updated_at = CURRENT_TIMESTAMP WHERE kod = ?',
                      newQuantity, product.nazwa, product.kod_kreskowy || '', dataWaznosci, product.objetosc || 0, product.kod
                    );
                  } else {
                    // Создаем новый продукт
                    // Конвертируем дату в timestamp для сохранения в БД
                    let dataWaznosci = null;
                    if (product.dataWaznosci) {
                      const date = new Date(product.dataWaznosci);
                      dataWaznosci = Math.floor(date.getTime() / 1000); // Конвертируем в Unix timestamp
                    }
                    
                    db.run(`INSERT INTO working_sheets (
                      fileName, kod, nazwa, ilosc, jednostka_miary, kod_kreskowy,
                      data_waznosci, archiwalny, rezerwacje, ilosc_na_poleceniach,
                      waga_netto, waga_brutto, objetosc, opis, typ
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                      'manual',
                      product.kod,
                      product.nazwa,
                      parseInt(product.ilosc) || 0,
                      'szt',
                      product.kod_kreskowy || '',
                      dataWaznosci, false, 0, 0, 0, 0, product.objetosc || 0, '', product.typ || null,
                      (err) => {
                        if (err) {
                          console.error('❌ Error creating product:', err);
                          reject(err);
                        } else {
                          console.log(`✅ Новый продукт ${product.kod} создан`);
                          resolve();
                        }
                      }
                    );
                  }
                  resolve();
                });
              });
            });

            // Выполняем все обновления
            Promise.all(updatePromises)
              .then(() => {
                // Фиксируем транзакцию
                db.run('COMMIT');
                res.json({ success: true });
              })
              .catch(error => {
                console.error('Error updating products:', error);
                db.run('ROLLBACK');
                res.status(500).json({ error: error.message });
              });
          })
          .catch(error => {
            console.error('Error reverting old changes:', error);
            db.run('ROLLBACK');
            res.status(500).json({ error: error.message });
          });
      } catch (error) {
        console.error('Error processing products:', error);
        db.run('ROLLBACK');
        res.status(500).json({ error: error.message });
      }
    });
  } catch (error) {
    console.error('Error processing update request:', error);
    db.run('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// Добавляем эндпоинт для удаления последней строки из working_sheets
app.delete('/api/working-sheets/last', (req, res) => {
  db.run('DELETE FROM working_sheets WHERE id = (SELECT MAX(id) FROM working_sheets)', function(err) {
    if (err) {
      console.error('Error deleting last row:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes > 0) {
      console.log('Last row deleted successfully');
      res.json({ success: true });
    } else {
      console.log('No rows to delete');
      res.json({ success: false, message: 'No rows to delete' });
    }
  });
});

// Эндпоинт для получения всех продуктов
app.get('/products', (req, res) => {
  db.all('SELECT * FROM products', [], (err, rows) => {
    if (err) {
      console.error('Ошибка при получении продуктов:', err);
      res.status(500).json({ error: 'Ошибка при получении продуктов' });
      return;
    }
    res.json(rows);
  });
});

// Добавляем endpoint для обработки существующего файла
app.post('/process_existing_file/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  console.log('Processing existing file:', fileName);
  
  // Проверяем, существует ли файл
  db.get('SELECT * FROM original_sheets WHERE fileName = ?', [fileName], (err, row) => {
    if (err) {
      console.error('Error checking file:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    // Обрабатываем файл
    processOriginalSheet(fileName)
      .then(() => {
        console.log('File processed successfully');
        res.json({ status: 'success', message: 'File processed successfully' });
      })
      .catch(error => {
        console.error('Error processing file:', error);
        res.status(500).json({ error: error.message });
      });
  });
});

// Добавляем endpoint для загрузки тестовых данных
app.post('/load_test_data', (req, res) => {
  console.log('Loading test data...');
  
  // Тестовые данные
  const testData = [
    {
      fileName: 'stany init.xlsx',
      kod: 'TEST001',
      nazwa: 'Testowy produkt 1',
      ilosc: 100,
      jednostka_miary: 'szt',
      kod_kreskowy: '1234567890123',
      data_waznosci: null,
      archiwalny: false,
      rezerwacje: 0,
      ilosc_na_poleceniach: 0,
      waga_netto: 0.5,
      waga_brutto: 0.6,
      objetosc: 0.001,
      opis: 'Testowy produkt do sprawdzenia systemu'
    },
    {
      fileName: 'stany init.xlsx',
      kod: 'TEST002',
      nazwa: 'Testowy produkt 2',
      ilosc: 50,
      jednostka_miary: 'szt',
      kod_kreskowy: '9876543210987',
      data_waznosci: null,
      archiwalny: false,
      rezerwacje: 0,
      ilosc_na_poleceniach: 0,
      waga_netto: 1.2,
      waga_brutto: 1.5,
      objetosc: 0.002,
      opis: 'Drugi testowy produkt'
    },
    {
      fileName: 'stany init.xlsx',
      kod: 'TEST003',
      nazwa: 'Testowy produkt 3',
      ilosc: 75,
      jednostka_miary: 'kg',
      kod_kreskowy: '4567891234567',
      data_waznosci: null,
      archiwalny: false,
      rezerwacje: 0,
      ilosc_na_poleceniach: 0,
      waga_netto: 2.0,
      waga_brutto: 2.2,
      objetosc: 0.003,
      opis: 'Trzeci testowy produkt'
    },
    {
      fileName: 'stany init.xlsx',
      kod: 'PROD001',
      nazwa: 'Produkt produkcyjny 1',
      ilosc: 200,
      jednostka_miary: 'szt',
      kod_kreskowy: '1111111111111',
      data_waznosci: null,
      archiwalny: false,
      rezerwacje: 0,
      ilosc_na_poleceniach: 0,
      waga_netto: 1.0,
      waga_brutto: 1.1,
      objetosc: 0.001,
      opis: 'Produkt produkcyjny'
    },
    {
      fileName: 'stany init.xlsx',
      kod: 'PROD002',
      nazwa: 'Produkt produkcyjny 2',
      ilosc: 150,
      jednostka_miary: 'szt',
      kod_kreskowy: '2222222222222',
      data_waznosci: null,
      archiwalny: false,
      rezerwacje: 0,
      ilosc_na_poleceniach: 0,
      waga_netto: 0.8,
      waga_brutto: 0.9,
      objetosc: 0.0008,
      opis: 'Drugi produkt produkcyjny'
    }
  ];

  // Начинаем транзакцию
  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      console.error('Error starting transaction:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    // Сначала очищаем таблицу working_sheets
    db.run('DELETE FROM working_sheets', (err) => {
      if (err) {
        console.error('Error clearing working_sheets:', err);
        db.run('ROLLBACK');
        res.status(500).json({ error: err.message });
        return;
      }

      // Подготавливаем statement для вставки
      const stmt = db.prepare(`
        INSERT INTO working_sheets (
          fileName, kod, nazwa, ilosc, jednostka_miary, kod_kreskowy,
          data_waznosci, archiwalny, rezerwacje, ilosc_na_poleceniach,
          waga_netto, waga_brutto, objetosc, opis
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let insertedCount = 0;
      const totalCount = testData.length;

      // Вставляем данные
      testData.forEach((item, index) => {
        stmt.run([
          item.fileName,
          item.kod,
          item.nazwa,
          item.ilosc,
          item.jednostka_miary,
          item.kod_kreskowy,
          item.data_waznosci,
          item.archiwalny,
          item.rezerwacje,
          item.ilosc_na_poleceniach,
          item.waga_netto,
          item.waga_brutto,
          item.objetosc,
          item.opis
        ], (err) => {
          if (err) {
            console.error('Error inserting item:', err);
            stmt.finalize();
            db.run('ROLLBACK');
            res.status(500).json({ error: err.message });
            return;
          }

          insertedCount++;
          
          // Если все данные вставлены
          if (insertedCount === totalCount) {
            stmt.finalize();
            db.run('COMMIT', (err) => {
              if (err) {
                console.error('Error committing transaction:', err);
                res.status(500).json({ error: err.message });
                return;
              }
              
              console.log(`Successfully loaded ${insertedCount} test products`);
              res.json({ 
                status: 'success', 
                message: `Loaded ${insertedCount} test products`,
                count: insertedCount
              });
            });
          }
        });
      });
    });
  });
});

// API endpoint для создания заказов
app.post('/api/orders', (req, res) => {
  const { clientName, order_number, products } = req.body;
  
  console.log('Creating order:', { clientName, order_number, products });
  console.log('Products details:', products.map(p => ({ kod: p.kod, nazwa: p.nazwa, ilosc: p.ilosc, typ: p.typ })));
  
  if (!clientName || !order_number || !products || products.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Вычисляем общее количество
  const totalQuantity = products.reduce((sum, product) => sum + (product.ilosc || 0), 0);

  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      console.error('Error starting transaction:', err);
      return res.status(500).json({ error: err.message });
    }

    db.run(
      'INSERT INTO orders (klient, numer_zamowienia, laczna_ilosc) VALUES (?, ?, ?)',
      [clientName, order_number, totalQuantity],
      function(err) {
        if (err) {
          console.error('Error creating order:', err);
          db.run('ROLLBACK');
          return res.status(500).json({ error: err.message });
        }

        const orderId = this.lastID;
        console.log('Order created with ID:', orderId);

        // Проверяем доступность продуктов и добавляем их в заказ
        let processedProducts = 0;
        const totalProducts = products.length;
        let hasError = false;

        products.forEach((product) => {
          // Проверяем доступное количество продукта
          db.get(
            'SELECT ilosc FROM working_sheets WHERE kod = ?',
            [product.kod],
            (err, row) => {
              if (err) {
                console.error('Error checking product quantity:', err);
                hasError = true;
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
              }

              const availableQuantity = row ? row.ilosc : 0;
              
              if (availableQuantity < product.ilosc) {
                hasError = true;
                db.run('ROLLBACK');
                return res.status(400).json({ 
                  error: `Insufficient quantity for product ${product.kod}. Available: ${availableQuantity}, Requested: ${product.ilosc}` 
                });
              }

              // Добавляем продукт в заказ
              db.run(
                'INSERT INTO order_products (orderId, kod, kod_kreskowy, nazwa, ilosc, typ) VALUES (?, ?, (SELECT kod_kreskowy FROM working_sheets WHERE kod = ?), ?, ?, ?)',
                [orderId, product.kod, product.kod, product.nazwa, product.ilosc, product.typ],
                (err) => {
                  if (err) {
                    console.error('Error adding product to order:', err);
                    hasError = true;
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                  }

                  // Уменьшаем количество продукта на складе
                  db.run(
                    'UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?',
                    [product.ilosc, product.kod],
                    (err) => {
                      if (err) {
                        console.error('Error updating product quantity:', err);
                        hasError = true;
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: err.message });
                      }

                      processedProducts++;
                      
                      // Если все продукты обработаны
                      if (processedProducts === totalProducts && !hasError) {
                        db.run('COMMIT', (err) => {
                          if (err) {
                            console.error('Error committing transaction:', err);
                            return res.status(500).json({ error: err.message });
                          }
                          
                          console.log('Order created successfully');
                          res.json({ 
                            status: 'success', 
                            message: 'Order created successfully',
                            orderId: orderId
                          });
                        });
                      }
                    }
                  );
                }
              );
            }
          );
        });
      }
    );
  });
});

// API endpoint для получения всех заказов
app.get('/api/orders', (req, res) => {
  const query = `
    SELECT 
      o.id,
      o.klient,
      o.numer_zamowienia,
      o.data_utworzenia,
      o.laczna_ilosc
    FROM orders o
    ORDER BY o.data_utworzenia DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching orders:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// API endpoint для получения всех заказов с продуктами
app.get('/api/orders-with-products', (req, res) => {
  const query = `
    SELECT 
      o.id,
      o.klient,
      o.numer_zamowienia,
      o.data_utworzenia,
      o.laczna_ilosc,
      op.id as product_id,
      op.kod,
      op.kod_kreskowy,
      op.nazwa,
      op.ilosc as product_ilosc,
      op.typ,
      op.created_at as product_created_at
    FROM orders o
    LEFT JOIN order_products op ON o.id = op.orderId
    ORDER BY o.data_utworzenia DESC, op.id
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching orders with products:', err);
      return res.status(500).json({ error: err.message });
    }
    
    // Группируем результаты по заказам
    const ordersMap = new Map();
    
    rows.forEach(row => {
      if (!ordersMap.has(row.id)) {
        ordersMap.set(row.id, {
          id: row.id,
          klient: row.klient,
          numer_zamowienia: row.numer_zamowienia,
          data_utworzenia: row.data_utworzenia,
          laczna_ilosc: row.laczna_ilosc,
          products: []
        });
      }
      
      if (row.product_id) {
        ordersMap.get(row.id).products.push({
          id: row.product_id,
          orderId: row.id,
          kod: row.kod,
          kod_kreskowy: row.kod_kreskowy,
          nazwa: row.nazwa,
          ilosc: row.product_ilosc,
          typ: row.typ,
          created_at: row.product_created_at
        });
      }
    });
    
    const orders = Array.from(ordersMap.values());
    res.json(orders);
  });
});

// API endpoint для получения заказа с продуктами
app.get('/api/orders/:id', (req, res) => {
  const orderId = req.params.id;
  
  // Получаем информацию о заказе
  db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, order) => {
    if (err) {
      console.error('Error fetching order:', err);
      return res.status(500).json({ error: err.message });
    }
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Получаем продукты заказа
    db.all('SELECT * FROM order_products WHERE orderId = ?', [orderId], (err, products) => {
      if (err) {
        console.error('Error fetching order products:', err);
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        ...order,
        products: products
      });
    });
  });
});

// API endpoint для получения клиента по имени
app.get('/api/clients/:name', (req, res) => {
  const clientName = req.params.name;
  
  db.get('SELECT * FROM clients WHERE nazwa = ? OR firma = ?', [clientName, clientName], (err, row) => {
    if (err) {
      console.error('Error fetching client:', err);
      return res.status(500).json({ error: err.message });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json(row);
  });
});

// Endpoint для генерации PDF по заказу
app.post('/api/orders/:id/pdf', async (req, res) => {
  const { order, client } = req.body;
  console.log('Received order data:', order);
  console.log('Received client data:', client);
  
  if (!order) {
    return res.status(400).json({ error: 'Order data required' });
  }

  // Название файла формируется в frontend
  console.log('Generating PDF for order:', order.numer_zamowienia);
  console.log('Client data:', client);

  try {
    // Создаем новый PDF документ
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([595, 842]); // A4 размер
    const { width, height } = page.getSize();

    // Загружаем стандартный шрифт
    const fontBytes = await fs.promises.readFile(path.join(__dirname, 'fonts', 'Sora-Regular.ttf'));
    const soraFont = await pdfDoc.embedFont(fontBytes);

    // Загружаем и встраиваем логотип
    const logoPath = path.join(__dirname, 'logo.png');
    const logoBytes = await fs.promises.readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    
    // Размеры логотипа (подстраиваем под PDF)
    const logoWidth = 180; // Уменьшили в 2 раза (было 360)
    const logoHeight = (logoImage.height * logoWidth) / logoImage.width;
    
    // --- ОДНА ТОНКАЯ РАМКА ---
    // Размеры страницы и рамки
    const pageWidth = 595; // A4
    const margin = 28.35; // 1 см в PDF-поинтах
    const frameWidth = pageWidth - 2 * margin;
    const frameHeight = logoHeight + 20;
    const frameX = margin;
    const frameY = height - margin - frameHeight; // 2 см отступ сверху
    // Центры половин
    const halfWidth = frameWidth / 2;
    const logoCenterX = frameX + halfWidth / 2;
    const logoCenterY = frameY + frameHeight / 2;
    const numberCenterX = frameX + halfWidth + halfWidth / 2;
    const numberCenterY = logoCenterY;
    // Логотип по центру левой половины (по горизонтали и вертикали)
    const logoDrawWidth = Math.min(logoWidth, halfWidth - 20); // чтобы не выходил за границы
    const logoDrawHeight = (logoImage.height * logoDrawWidth) / logoImage.width;
    page.drawImage(logoImage, {
      x: logoCenterX - logoDrawWidth / 2,
      y: logoCenterY - logoDrawHeight / 2,
      width: logoDrawWidth,
      height: logoDrawHeight,
    });
    // Номер заказа по центру правой половины (по горизонтали и вертикали)
    const orderFontSize = 16;
    const orderTextWidth = soraFont.widthOfTextAtSize(order.numer_zamowienia, orderFontSize);
    page.drawText(order.numer_zamowienia, {
      x: numberCenterX - orderTextWidth / 2,
      y: numberCenterY - orderFontSize / 2,
      size: orderFontSize,
      font: soraFont,
      color: rgb(0, 0, 0),
    });
    // Внешняя тонкая рамка и разделитель только линиями
    const borderThickness = 0.05;
    // Верхняя линия
    page.drawLine({ start: { x: frameX, y: frameY }, end: { x: frameX + frameWidth, y: frameY }, thickness: borderThickness, color: rgb(0, 0, 0) });
    // Нижняя линия
    page.drawLine({ start: { x: frameX, y: frameY + frameHeight }, end: { x: frameX + frameWidth, y: frameY + frameHeight }, thickness: borderThickness, color: rgb(0, 0, 0) });
    // Левая линия
    page.drawLine({ start: { x: frameX, y: frameY }, end: { x: frameX, y: frameY + frameHeight }, thickness: borderThickness, color: rgb(0, 0, 0) });
    // Правая линия
    page.drawLine({ start: { x: frameX + frameWidth, y: frameY }, end: { x: frameX + frameWidth, y: frameY + frameHeight }, thickness: borderThickness, color: rgb(0, 0, 0) });
    // Одна разделительная линия ровно по центру
    page.drawLine({ start: { x: frameX + halfWidth, y: frameY }, end: { x: frameX + halfWidth, y: frameY + frameHeight }, thickness: borderThickness, color: rgb(0, 0, 0) });

    // --- ДОПОЛНИТЕЛЬНЫЙ ПРЯМОУГОЛЬНИК ПОД ЛОГОТИПОМ И НОМЕРОМ ЗАКАЗА ---
    const additionalFrameHeight = 120; // Высота дополнительного прямоугольника (увеличена еще в 2 раза)
    const additionalFrameY = frameY - additionalFrameHeight - 28.35; // 1 см отступа от основного прямоугольника (28.35 пунктов = 1 см)
    
    // Рисуем дополнительный прямоугольник с светло-фиолетовым фоном
    page.drawRectangle({ 
      x: frameX, 
      y: additionalFrameY, 
      width: frameWidth, 
      height: additionalFrameHeight, 
      color: rgb(0.95, 0.93, 0.98) // Светло-фиолетовый/бледно-лавандовый цвет
    });

    // Добавляем тонкую рамку как у основного прямоугольника
    const clientBorderThickness = 0.05;
    page.drawLine({ start: { x: frameX, y: additionalFrameY }, end: { x: frameX + frameWidth, y: additionalFrameY }, thickness: clientBorderThickness, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: frameX, y: additionalFrameY + additionalFrameHeight }, end: { x: frameX + frameWidth, y: additionalFrameY + additionalFrameHeight }, thickness: clientBorderThickness, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: frameX, y: additionalFrameY }, end: { x: frameX, y: additionalFrameY + additionalFrameHeight }, thickness: clientBorderThickness, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: frameX + frameWidth, y: additionalFrameY }, end: { x: frameX + frameWidth, y: additionalFrameY + additionalFrameHeight }, thickness: clientBorderThickness, color: rgb(0, 0, 0) });

    // Добавляем данные клиента на прямоугольник
    if (client) {
      const clientFontSize = 11; // Увеличили размер шрифта еще больше
      const lineHeight = 20; // Уменьшили высоту строки
      
      // Вычисляем позиции для горизонтального выравнивания текста
      const textPadding = 30; // Увеличили отступы от краев рамки
      const availableWidth = frameWidth - (textPadding * 2); // Доступная ширина для текста
      const leftColumnX = frameX + textPadding; // Левая колонка
      const rightColumnX = frameX + frameWidth / 2 + 20; // Правая колонка с большим отступом от центра
      
      // Подсчитываем количество строк для центрирования
      let totalLines = 0;
      if (client.nazwa) totalLines++;
      if (client.firma) totalLines++;
      if (client.adres) totalLines++;
      if (client.kontakt) totalLines++;
      totalLines++; // Czas dostawy всегда отображается
      
      // Центрируем текст по вертикали в прямоугольнике с отступом сверху
      const totalTextHeight = totalLines * lineHeight;
      const startY = additionalFrameY + (additionalFrameHeight - totalTextHeight) / 2 + 20;
      const clientTextY = startY;
      
      // Размещаем текст в правильном порядке
      let currentLine = 0;
      
      // Первая строка: Adres (левая колонка)
      if (client.adres) {
        // Рисуем заголовок "Adres:" жирным
        const adresHeader = "Adres:";
        const adresHeaderWidth = soraFont.widthOfTextAtSize(adresHeader, clientFontSize);
        page.drawText(adresHeader, { 
          x: leftColumnX, 
          y: clientTextY + (currentLine * lineHeight), 
          size: clientFontSize, 
          font: soraFont, 
          color: rgb(0, 0, 0) // Жирный черный для заголовка
        });
        
        // Рисуем значение адреса светлее
        const adresValue = client.adres;
        const maxAdresValueWidth = availableWidth / 2 - 5 - adresHeaderWidth - 5; // Оставляем место для заголовка
        const truncatedAdresValue = soraFont.widthOfTextAtSize(adresValue, clientFontSize) > maxAdresValueWidth 
          ? adresValue.substring(0, Math.floor(maxAdresValueWidth / soraFont.widthOfTextAtSize('a', clientFontSize))) + '...'
          : adresValue;
        
        page.drawText(truncatedAdresValue, { 
          x: leftColumnX + adresHeaderWidth + 7, 
          y: clientTextY + (currentLine * lineHeight), 
          size: clientFontSize, 
          font: soraFont, 
          color: rgb(0.2, 0.2, 0.2) // Светлее для значений
        });
      }
      currentLine++;
      
      // Вторая строка: Klient (левая колонка) и Czas dostawy (правая колонка)
      if (client.nazwa) {
        // Рисуем заголовок "Nazwa:" жирным
        const klientHeader = "Nazwa:";
        const klientHeaderWidth = soraFont.widthOfTextAtSize(klientHeader, clientFontSize);
        page.drawText(klientHeader, { 
          x: leftColumnX, 
          y: clientTextY + (currentLine * lineHeight), 
          size: clientFontSize, 
          font: soraFont, 
          color: rgb(0, 0, 0) // Жирный черный для заголовка
        });

        // Рисуем значение клиента светлее
        const klientValue = client.nazwa;
        const maxKlientValueWidth = availableWidth / 2 - 5 - klientHeaderWidth - 5; // Оставляем место для заголовка
        const truncatedKlientValue = soraFont.widthOfTextAtSize(klientValue, clientFontSize) > maxKlientValueWidth 
          ? klientValue.substring(0, Math.floor(maxKlientValueWidth / soraFont.widthOfTextAtSize('a', clientFontSize))) + '...'
          : klientValue;
        
        page.drawText(truncatedKlientValue, { 
          x: leftColumnX + klientHeaderWidth + 7, 
          y: clientTextY + (currentLine * lineHeight), 
          size: clientFontSize, 
          font: soraFont, 
          color: rgb(0.2, 0.2, 0.2) // Светлее для значений
        });
      }
      
      // Czas dostawy в правой колонке второй строки
      const czasDostawy = client.czas_dostawy || client.czasDostawy || client.czas_dostawy || 'Nie określono';
      
      // Рисуем заголовок "Czas dostawy:" жирным
      const czasHeader = "Czas dostawy:";
      const czasHeaderWidth = soraFont.widthOfTextAtSize(czasHeader, clientFontSize);
      page.drawText(czasHeader, { 
        x: rightColumnX, 
        y: clientTextY + (currentLine * lineHeight), 
        size: clientFontSize, 
        font: soraFont, 
        color: rgb(0, 0, 0) // Жирный черный для заголовка
      });
      
      // Рисуем значение времени доставки светлее
      const maxCzasValueWidth = availableWidth / 2 - 5 - czasHeaderWidth - 5; // Оставляем место для заголовка
      const truncatedCzasValue = soraFont.widthOfTextAtSize(czasDostawy, clientFontSize) > maxCzasValueWidth 
        ? czasDostawy.substring(0, Math.floor(maxCzasValueWidth / soraFont.widthOfTextAtSize('a', clientFontSize))) + '...'
        : czasDostawy;
      
      page.drawText(truncatedCzasValue, { 
        x: rightColumnX + czasHeaderWidth + 7, 
        y: clientTextY + (currentLine * lineHeight), 
        size: clientFontSize, 
        font: soraFont, 
        color: rgb(0.2, 0.2, 0.2) // Светлее для значений
      });
      currentLine++;
      
      // Третья строка: Firma (левая колонка), Adres и Kontakt (правая колонка)
      if (client.firma) {
        // Рисуем заголовок "Firma:" жирным
        const firmaHeader = "Firma:";
        const firmaHeaderWidth = soraFont.widthOfTextAtSize(firmaHeader, clientFontSize);
        page.drawText(firmaHeader, { 
          x: leftColumnX, 
          y: clientTextY + (currentLine * lineHeight), 
          size: clientFontSize, 
          font: soraFont, 
          color: rgb(0, 0, 0) // Жирный черный для заголовка
        });
        
        // Рисуем значение фирмы светлее
        const firmaValue = client.firma;
        const maxFirmaValueWidth = availableWidth / 2 - 5 - firmaHeaderWidth - 5; // Оставляем место для заголовка
        const truncatedFirmaValue = soraFont.widthOfTextAtSize(firmaValue, clientFontSize) > maxFirmaValueWidth 
          ? firmaValue.substring(0, Math.floor(maxFirmaValueWidth / soraFont.widthOfTextAtSize('a', clientFontSize))) + '...'
          : firmaValue;
        
        page.drawText(truncatedFirmaValue, { 
          x: leftColumnX + firmaHeaderWidth + 7, 
          y: clientTextY + (currentLine * lineHeight), 
          size: clientFontSize, 
          font: soraFont, 
          color: rgb(0.2, 0.2, 0.2) // Светлее для значений
        });
      }
      
      if (client.kontakt) {
        // Рисуем заголовок "Kontakt:" жирным
        const kontaktHeader = "Kontakt:";
        const kontaktHeaderWidth = soraFont.widthOfTextAtSize(kontaktHeader, clientFontSize);
        page.drawText(kontaktHeader, { 
          x: rightColumnX, 
          y: clientTextY + (currentLine * lineHeight), 
          size: clientFontSize, 
          font: soraFont, 
          color: rgb(0, 0, 0) // Жирный черный для заголовка
        });
        
        // Рисуем значение контакта светлее
        const kontaktValue = client.kontakt;
        const maxKontaktValueWidth = availableWidth / 2 - 5 - kontaktHeaderWidth - 5; // Оставляем место для заголовка
        const truncatedKontaktValue = soraFont.widthOfTextAtSize(kontaktValue, clientFontSize) > maxKontaktValueWidth 
          ? kontaktValue.substring(0, Math.floor(maxKontaktValueWidth / soraFont.widthOfTextAtSize('a', clientFontSize))) + '...'
          : kontaktValue;
        
        page.drawText(truncatedKontaktValue, { 
          x: rightColumnX + kontaktHeaderWidth + 7, 
          y: clientTextY + (currentLine * lineHeight), 
          size: clientFontSize, 
          font: soraFont, 
          color: rgb(0.2, 0.2, 0.2) // Светлее для значений
        });
      }
    } else {
      // Если данных клиента нет, показываем только название клиента из заказа
      const clientTextY = additionalFrameY + additionalFrameHeight - 8;
      page.drawText(`Nazwa: ${order.klient}`, { 
        x: frameX + 10, 
        y: clientTextY, 
        size: 10, 
        font: soraFont, 
        color: rgb(0, 0, 0) 
      });
    }

    let y = height - 350 + 28.35; // Сдвигаем таблицу вверх на 1 см от блока с данными клиентов

    // Таблица товаров - используем ту же ширину и позицию, что и прямоугольник выше
    const tableX = frameX; // Та же позиция X, что и у прямоугольника
    const tableWidth = frameWidth; // Та же ширина, что и у прямоугольника
    
    // Распределяем колонки по всей ширине таблицы
    const colX = [tableX + 30, tableX + 90, tableX + 350, tableX + 500];
    const colWidths = [60, 260, 150, 30];

    // Проверяем, что все заголовки выровнены по левому краю
    console.log('Table coordinates:', { tableX, tableWidth, colX, colWidths });
    const rowHeight = 40;
    const cellPadding = 6;
    const tableFontSize = 9;



    // Заголовки таблицы
    const headers = ['Kod', 'Nazwa', 'Kod kreskowy', 'Ilość'];
    
    // Рамка для заголовка таблицы
    const headerY = y;
    
    // Заливка заголовка светло-красным/лососевым цветом
    page.drawRectangle({ 
      x: tableX, 
      y: headerY - rowHeight, 
      width: tableWidth, 
      height: rowHeight, 
      color: rgb(1.0, 0.8, 0.8) // Светло-красный/лососевый цвет
    });
    
    page.drawLine({ start: { x: tableX, y: headerY }, end: { x: tableX + tableWidth, y: headerY }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: tableX, y: headerY - rowHeight }, end: { x: tableX + tableWidth, y: headerY - rowHeight }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: tableX, y: headerY }, end: { x: tableX, y: headerY - rowHeight }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: tableX + tableWidth, y: headerY }, end: { x: tableX + tableWidth, y: headerY - rowHeight }, thickness: 0.5, color: rgb(0, 0, 0) });

    // Вертикальные линии между колонками в заголовке
    for (let i = 1; i < colX.length; i++) {
      page.drawLine({ start: { x: colX[i], y: headerY }, end: { x: colX[i], y: headerY - rowHeight }, thickness: 0.5, color: rgb(0, 0, 0) });
    }

    for (let i = 0; i < headers.length; i++) {
      let headerX = colX[i] + cellPadding;
      // Для первой колонки (Kod) уменьшаем отступ
      if (i === 0) {
        headerX = colX[i] - 25; // Еще немного назад (вправо) для Kod
      }
      const textWidth = soraFont.widthOfTextAtSize(headers[i], tableFontSize + 1);
      console.log(`Header ${headers[i]}: x=${headerX}, colX=${colX[i]}, cellPadding=${cellPadding}, textWidth=${textWidth}`);
      
      // Вертикальное выравнивание по центру ячейки
      const headerY = y - (rowHeight / 2) - ((tableFontSize + 1) / 2);
      
      page.drawText(headers[i], { 
        x: headerX, 
        y: headerY, 
        size: tableFontSize + 1, 
        font: soraFont, 
        color: rgb(0, 0, 0),
        textAlign: 'left'
      });
    }
    y -= rowHeight;
    y -= 15; // Дополнительный отступ между заголовками и первой строкой данных

    // Данные товаров
    (order.products || []).forEach((product, index) => {
      
      // Обработка длинных названий - перенос на вторую строку
      let productName = product.nazwa;
      let fontSize = tableFontSize;
      let productNameLines = [productName];
      
      // Если название длинное, разбиваем на строки
      if (productName.length > 40) {
        const words = productName.split(' ');
        let line1 = '';
        let line2 = '';
        
        for (let word of words) {
          if ((line1 + ' ' + word).length <= 40) {
            line1 += (line1 ? ' ' : '') + word;
          } else {
            line2 += (line2 ? ' ' : '') + word;
          }
        }
        
        productNameLines = [line1];
        if (line2) {
          productNameLines.push(line2);
        }
        fontSize = 8; // Уменьшаем шрифт для многострочного текста
      }
      // Kod
      page.drawText(product.kod, { x: colX[0] - 25, y: y - 20, size: tableFontSize, font: soraFont, color: rgb(0, 0, 0) });
      // Nazwa - поддерживаем многострочный текст
      productNameLines.forEach((line, lineIndex) => {
        const lineY = y - 20 - (lineIndex * (fontSize + 2)); // Отступ между строками 2 пункта
        page.drawText(line, { x: colX[1] + cellPadding, y: lineY, size: fontSize, font: soraFont, color: rgb(0, 0, 0) });
      });
      // Kod kreskowy
      page.drawText(product.kod_kreskowy || '-', { x: colX[2] + cellPadding, y: y - 20, size: tableFontSize, font: soraFont, color: rgb(0, 0, 0) });
      // Ilość
      page.drawText(String(product.ilosc), { x: colX[3] + cellPadding, y: y - 20, size: tableFontSize, font: soraFont, color: rgb(0, 0, 0) });
      y -= rowHeight;
    });

    // Черта в конце списка позиций
    const totalLineY = y - 15; // Опускаем линию на 15 пунктов (как отступ между заголовком и первой строкой)
    page.drawLine({ start: { x: tableX, y: totalLineY }, end: { x: tableX + tableWidth, y: totalLineY }, thickness: 0.05, color: rgb(0, 0, 0) });
    
    // Вычисляем сумму количества
    const totalQuantity = (order.products || []).reduce((sum, product) => sum + (product.ilosc || 0), 0);
    
    // Текст суммы по левому краю (как остальные значения в колонке Ilość)
    const sumText = String(totalQuantity);
    const sumTextX = colX[3] + cellPadding; // Та же позиция, что и у значений выше
    const sumTextY = totalLineY - 20; // Та же высота, что и у значений выше
    
    page.drawText(sumText, { 
      x: sumTextX, 
      y: sumTextY, 
      size: tableFontSize, 
      font: soraFont, 
      color: rgb(0, 0, 0)
    });



    // Сохраняем PDF
    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// API endpoint для обновления заказа
app.put('/api/orders/:id', (req, res) => {
  const orderId = req.params.id;
  const { klient, numer_zamowienia, products } = req.body;

  console.log('Updating order:', orderId, { klient, numer_zamowienia, products });
  console.log('Products data:', JSON.stringify(products, null, 2));

  // Начинаем транзакцию
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // Получаем старые продукты заказа для расчета изменений
    db.all('SELECT * FROM order_products WHERE orderId = ?', [orderId], (err, oldProducts) => {
      if (err) {
        console.error('Error fetching old products:', err);
        db.run('ROLLBACK');
        return res.status(500).json({ error: err.message });
      }

      // Создаем карту старых продуктов по коду
      const oldProductsMap = new Map();
      oldProducts.forEach(product => {
        oldProductsMap.set(product.kod, product.ilosc);
      });

      // Создаем карту новых продуктов по коду
      const newProductsMap = new Map();
      if (products && products.length > 0) {
        products.forEach(product => {
          newProductsMap.set(product.kod, product.ilosc);
        });
      }

      // Обновляем основную информацию о заказе
      db.run(
        'UPDATE orders SET klient = ?, numer_zamowienia = ? WHERE id = ?',
        [klient, numer_zamowienia, orderId],
        function(err) {
          if (err) {
            console.error('Error updating order:', err);
            db.run('ROLLBACK');
            return res.status(500).json({ error: err.message });
          }

          // Удаляем старые продукты заказа
          db.run('DELETE FROM order_products WHERE orderId = ?', [orderId], function(err) {
            if (err) {
              console.error('Error deleting old products:', err);
              db.run('ROLLBACK');
              return res.status(500).json({ error: err.message });
            }

            // Добавляем новые продукты
            if (products && products.length > 0) {
              const insertStmt = db.prepare(
                'INSERT INTO order_products (orderId, kod, kod_kreskowy, nazwa, ilosc, typ) VALUES (?, ?, ?, ?, ?, ?)'
              );

              let completed = 0;
              let hasError = false;

              products.forEach((product, index) => {
                console.log('Inserting product:', {
                  orderId,
                  kod: product.kod,
                  kod_kreskowy: product.kod_kreskowy,
                  nazwa: product.nazwa,
                  ilosc: product.ilosc,
                  typ: product.typ
                });
                
                insertStmt.run(
                  [orderId, product.kod, product.kod_kreskowy, product.nazwa, product.ilosc, product.typ],
                  function(err) {
                    if (err) {
                      console.error('Error inserting product:', err);
                      hasError = true;
                    }
                    completed++;
                    
                    if (completed === products.length) {
                      insertStmt.finalize();
                      
                      if (hasError) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Error inserting products' });
                      }

                      // Обновляем количество в working_sheets
                      updateWorkingSheetsQuantities(oldProductsMap, newProductsMap, () => {
                        // Обновляем общую сумму заказа
                        db.run(
                          'UPDATE orders SET laczna_ilosc = (SELECT SUM(ilosc) FROM order_products WHERE orderId = ?) WHERE id = ?',
                          [orderId, orderId],
                          function(err) {
                            if (err) {
                              console.error('Error updating total quantity:', err);
                              db.run('ROLLBACK');
                              return res.status(500).json({ error: err.message });
                            }

                            db.run('COMMIT');
                            res.json({ message: 'Order updated successfully' });
                          }
                        );
                      });
                    }
                  }
                );
              });
            } else {
              // Если нет продуктов, обновляем количество в working_sheets (убираем все старые)
              updateWorkingSheetsQuantities(oldProductsMap, new Map(), () => {
                // Обновляем общую сумму на 0
                db.run(
                  'UPDATE orders SET laczna_ilosc = 0 WHERE id = ?',
                  [orderId],
                  function(err) {
                    if (err) {
                      console.error('Error updating total quantity:', err);
                      db.run('ROLLBACK');
                      return res.status(500).json({ error: err.message });
                    }

                    db.run('COMMIT');
                    res.json({ message: 'Order updated successfully' });
                  }
                );
              });
            }
          });
        }
      );
    });
  });

  // Функция для обновления количества в working_sheets
  function updateWorkingSheetsQuantities(oldProductsMap, newProductsMap, callback) {
    const allCodes = new Set([...oldProductsMap.keys(), ...newProductsMap.keys()]);
    let completed = 0;
    let hasError = false;

    if (allCodes.size === 0) {
      callback();
      return;
    }

    allCodes.forEach(kod => {
      const oldQuantity = oldProductsMap.get(kod) || 0;
      const newQuantity = newProductsMap.get(kod) || 0;
      const difference = newQuantity - oldQuantity;

      if (difference !== 0) {
        // Обновляем количество в working_sheets
        db.run(
          'UPDATE working_sheets SET ilosc = ilosc - ? WHERE kod = ?',
          [difference, kod],
          function(err) {
            if (err) {
              console.error(`Error updating working_sheets for kod ${kod}:`, err);
              hasError = true;
            }
            completed++;
            
            if (completed === allCodes.size) {
              if (hasError) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Error updating working_sheets' });
              }
              callback();
            }
          }
        );
      } else {
        completed++;
        if (completed === allCodes.size) {
          if (hasError) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Error updating working_sheets' });
          }
          callback();
        }
      }
    });
  }
});

// Запускаем сервер
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Database connection status:', db ? 'Connected' : 'Not connected');
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Настройка статических файлов для React приложения
app.use(express.static(path.join(__dirname, '../dist')))

// Fallback для SPA - все остальные маршруты ведут к index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

// API endpoint для получения продуктов заказа
app.get('/api/orders/:id/products', (req, res) => {
  const orderId = req.params.id;
  
  db.all(`
    SELECT 
      op.id,
      op.orderId,
      op.kod,
      op.kod_kreskowy,
      op.nazwa,
      op.ilosc,
      op.typ,
      op.created_at,
      ws.data_waznosci
    FROM order_products op
    LEFT JOIN working_sheets ws ON op.kod = ws.kod
    WHERE op.orderId = ?
  `, [orderId], (err, products) => {
    if (err) {
      console.error('Error fetching order products:', err);
      return res.status(500).json({ error: err.message });
    }
    
    res.json(products);
  });
});

// API endpoint для удаления заказа
app.delete('/api/orders/:id', (req, res) => {
  const orderId = req.params.id;

  console.log('Deleting order:', orderId);

  // Начинаем транзакцию
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // Получаем продукты заказа для восстановления количества
    db.all('SELECT * FROM order_products WHERE orderId = ?', [orderId], (err, products) => {
      if (err) {
        console.error('Error fetching order products:', err);
        db.run('ROLLBACK');
        return res.status(500).json({ error: err.message });
      }

      // Удаляем продукты заказа
      db.run('DELETE FROM order_products WHERE orderId = ?', [orderId], function(err) {
        if (err) {
          console.error('Error deleting order products:', err);
          db.run('ROLLBACK');
          return res.status(500).json({ error: err.message });
        }

        // Удаляем сам заказ
        db.run('DELETE FROM orders WHERE id = ?', [orderId], function(err) {
          if (err) {
            console.error('Error deleting order:', err);
            db.run('ROLLBACK');
            return res.status(500).json({ error: err.message });
          }

          // Восстанавливаем количество в working_sheets
          if (products && products.length > 0) {
            let completed = 0;
            let hasError = false;

            products.forEach((product) => {
              db.run(
                'UPDATE working_sheets SET ilosc = ilosc + ? WHERE kod = ?',
                [product.ilosc, product.kod],
                function(err) {
                  if (err) {
                    console.error(`Error updating working_sheets for kod ${product.kod}:`, err);
                    hasError = true;
                  }
                  completed++;
                  
                  if (completed === products.length) {
                    if (hasError) {
                      db.run('ROLLBACK');
                      return res.status(500).json({ error: 'Error updating working_sheets' });
                    }

                    db.run('COMMIT');
                    res.json({ message: 'Order deleted successfully' });
                  }
                }
              );
            });
          } else {
            db.run('COMMIT');
            res.json({ message: 'Order deleted successfully' });
          }
        });
      });
    });
  });
});

// API endpoint для получения истории цен товара
app.get('/api/product-prices/:productKod', (req, res) => {
  const { productKod } = req.params;
  
  const query = `
    SELECT 
      ph.id,
      ph.sprzedawca,
      ph.cena,
      ph.ilosc,
      ph.data_dostawy,
      ph.created_at,
      ws.nazwa as product_name
    FROM price_history ph
    LEFT JOIN working_sheets ws ON ph.working_sheet_id = ws.id
    WHERE ph.product_kod = ?
    ORDER BY ph.created_at DESC
  `;
  
  db.all(query, [productKod], (err, rows) => {
    if (err) {
      console.error('Error fetching product prices:', err);
      return res.status(500).json({ error: err.message });
    }
    
    const prices = rows.map(row => ({
      ...row,
      data_dostawy: row.data_dostawy ? new Date(row.data_dostawy).toLocaleDateString('pl-PL') : null,
      created_at: new Date(row.created_at).toLocaleDateString('pl-PL')
    }));
    
    res.json(prices);
  });
});

// API endpoint для создания записи в price_history
app.post('/api/price-history', (req, res) => {
  const { working_sheet_id, product_kod, sprzedawca, cena, ilosc, data_dostawy, is_manual_edit } = req.body;
  
  if (!working_sheet_id || !product_kod || !cena) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const query = `
    INSERT INTO price_history (
      working_sheet_id, product_kod, sprzedawca, cena, ilosc, data_dostawy, is_manual_edit
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, [
    working_sheet_id, 
    product_kod, 
    sprzedawca || null, 
    cena, 
    ilosc || 0, 
    data_dostawy || null,
    is_manual_edit || false
  ], function(err) {
    if (err) {
      console.error('Error creating price history record:', err);
      return res.status(500).json({ error: err.message });
    }
    
    res.json({ 
      success: true, 
      id: this.lastID,
      message: 'Price history record created successfully' 
    });
  });
});

// API endpoint для получения данных из working_sheets (stany magazynowe)
app.get('/api/working-sheets', (req, res) => {
  const query = `
    SELECT 
      id,
      kod,
      nazwa,
      ilosc,
      jednostka_miary,
      kod_kreskowy,
      data_waznosci,
      archiwalny,
      rezerwacje,
      ilosc_na_poleceniach,
      waga_netto,
      waga_brutto,
      objetosc,
      typ,
      sprzedawca,
      cena,
      cena_sprzedazy,
      opis,
      updated_at
    FROM working_sheets
    ORDER BY nazwa ASC
  `;
  db.all(query, [], async (err, rows) => {
    if (err) {
      console.error('Error fetching working sheets:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log('Working sheets raw data (first 3 rows):', rows.slice(0, 3));
    console.log('Sample typ values:', rows.slice(0, 3).map(row => ({ kod: row.kod, typ: row.typ })));
    // Для каждого товара ищем сумму wartosc из product_receipts
    const receipts = await new Promise((resolve, reject) => {
      db.all('SELECT id, wartosc, products FROM product_receipts', [], (err, receiptsRows) => {
        if (err) reject(err);
        else resolve(receiptsRows);
      });
    });
    const result = rows.map(item => {
      let totalWartosc = 0;
      receipts.forEach(receipt => {
        try {
          const products = JSON.parse(receipt.products);
          if (Array.isArray(products)) {
            products.forEach(prod => {
              if (prod.kod === item.kod && prod.cena && prod.ilosc) {
                totalWartosc += prod.cena * prod.ilosc;
              }
            });
          }
        } catch (e) {}
      });
      return { ...item, wartosc: totalWartosc };
    });
    res.json(result);
  });
});

// API endpoint для обновления записей в working_sheets
app.put('/api/working-sheets/update', (req, res) => {
  const { id, sprzedawca, typ, objetosc, data_waznosci, cena, cena_sprzedazy } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }

  const updateFields = [];
  const params = [];
  
  if (sprzedawca !== undefined) {
    updateFields.push('sprzedawca = ?');
    params.push(sprzedawca);
  }
  
  if (typ !== undefined) {
    updateFields.push('typ = ?');
    params.push(typ);
  }
  
  if (objetosc !== undefined) {
    updateFields.push('objetosc = ?');
    params.push(objetosc);
  }
  
  if (data_waznosci !== undefined) {
    updateFields.push('data_waznosci = ?');
    params.push(data_waznosci);
  }
  
  if (cena !== undefined) {
    updateFields.push('cena = ?');
    params.push(cena);
  }
  
  if (cena_sprzedazy !== undefined) {
    updateFields.push('cena_sprzedazy = ?');
    params.push(cena_sprzedazy);
  }
  
  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  params.push(id);
  
  const query = `UPDATE working_sheets SET ${updateFields.join(', ')} WHERE id = ?`;
  
  db.run(query, params, function(err) {
    if (err) {
      console.error('Error updating working_sheets:', err);
      return res.status(500).json({ error: 'Failed to update record' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    res.json({ success: true, changes: this.changes });
  });
});
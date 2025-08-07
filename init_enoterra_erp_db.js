const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Путь к файлу базы данных
const dbPath = path.join(__dirname, 'enoterra_erp.db');

// Создаем подключение к базе данных
const db = new sqlite3.Database(dbPath);

console.log('🔧 Инициализация базы данных enoterra_erp.db...');

// Функция для выполнения SQL запросов
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('❌ Ошибка выполнения запроса:', err);
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

// Функция для выполнения множественных запросов
async function initializeDatabase() {
    try {
        console.log('📋 Создание таблиц...');

        // 1. Таблица products - Продукты/Товары (18 полей)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kod TEXT UNIQUE NOT NULL,
                nazwa TEXT NOT NULL,
                ilosc INTEGER DEFAULT 0,
                jednostka_miary TEXT,
                kod_kreskowy TEXT,
                data_waznosci INTEGER,
                archiwalny INTEGER DEFAULT 0,
                rezerwacje INTEGER DEFAULT 0,
                ilosc_na_poleceniach INTEGER DEFAULT 0,
                waga_netto REAL,
                waga_brutto REAL,
                objetosc REAL,
                opis TEXT,
                cena REAL DEFAULT 0,
                cena_sprzedazy REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица products создана');

        // 2. Таблица clients - Клиенты (9 полей)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nazwa TEXT NOT NULL,
                firma TEXT,
                adres TEXT,
                kontakt TEXT,
                czas_dostawy TEXT,
                email TEXT,
                telefon TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица clients создана');

        // 3. Таблица orders - Заказы (7 полей)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                klient TEXT NOT NULL,
                numer_zamowienia TEXT UNIQUE NOT NULL,
                data_zamowienia TEXT,
                status TEXT DEFAULT 'pending',
                laczna_ilosc INTEGER DEFAULT 0,
                data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица orders создана');

        // 4. Таблица order_products - Продукты в заказах (11 полей)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS order_products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER,
                kod TEXT NOT NULL,
                nazwa TEXT NOT NULL,
                kod_kreskowy TEXT,
                ilosc INTEGER NOT NULL,
                typ TEXT DEFAULT 'sprzedaz',
                product_kod TEXT,
                cena REAL DEFAULT 0,
                FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
            )
        `);
        console.log('✅ Таблица order_products создана');

        // 5. Таблица working_sheets - Рабочие листы (18 полей)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS working_sheets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data DATE NOT NULL,
                produkt_id INTEGER,
                kod TEXT NOT NULL,
                nazwa TEXT NOT NULL,
                ilosc INTEGER NOT NULL,
                typ TEXT DEFAULT 'sprzedaz',
                jednostka_miary TEXT,
                kod_kreskowy TEXT,
                data_waznosci INTEGER,
                archiwalny INTEGER DEFAULT 0,
                rezerwacje INTEGER DEFAULT 0,
                ilosc_na_poleceniach INTEGER DEFAULT 0,
                waga_netto REAL,
                waga_brutto REAL,
                objetosc REAL,
                opis TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (produkt_id) REFERENCES products (id) ON DELETE SET NULL
            )
        `);
        console.log('✅ Таблица working_sheets создана');

        // 6. Таблица product_receipts - Приемки товаров (12 полей)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS product_receipts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data DATE NOT NULL,
                produkt_id INTEGER,
                kod TEXT NOT NULL,
                nazwa TEXT NOT NULL,
                ilosc INTEGER NOT NULL,
                wartosc REAL DEFAULT 0,
                koszt_dostawy REAL DEFAULT 0,
                sprzedawca TEXT,
                numer_faktury TEXT,
                uwagi TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (produkt_id) REFERENCES products (id) ON DELETE SET NULL
            )
        `);
        console.log('✅ Таблица product_receipts создана');

        // 7. Таблица original_sheets - Оригинальные листы (4 поля)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS original_sheets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица original_sheets создана');

        // 8. Таблица price_history - История цен (8 полей)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                kod TEXT NOT NULL,
                nazwa TEXT NOT NULL,
                cena REAL NOT NULL,
                data_zmiany DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
            )
        `);
        console.log('✅ Таблица price_history создана');

        // 9. Таблица product_prices - Цены продуктов (6 полей)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS product_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kod TEXT UNIQUE NOT NULL,
                nazwa TEXT NOT NULL,
                cena REAL DEFAULT 0,
                cena_sprzedazy REAL DEFAULT 0,
                data_aktualizacji TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица product_prices создана');

        // Добавляем тестовые данные
        console.log('📝 Добавление тестовых данных...');

        // Тестовые продукты
        await runQuery(`
            INSERT OR IGNORE INTO products (kod, nazwa, ilosc, jednostka_miary, cena, cena_sprzedazy) VALUES 
            ('PROD001', 'Тестовый продукт 1', 100, 'шт', 10.50, 15.00),
            ('PROD002', 'Тестовый продукт 2', 50, 'кг', 25.00, 35.00),
            ('PROD003', 'Тестовый продукт 3', 200, 'л', 5.00, 8.00)
        `);

        // Тестовые клиенты
        await runQuery(`
            INSERT OR IGNORE INTO clients (nazwa, firma, adres, kontakt, email, telefon) VALUES 
            ('Иван Петров', 'ООО Тест', 'ул. Тестовая, 1', 'Менеджер', 'ivan@test.com', '+7-999-123-45-67'),
            ('Мария Сидорова', 'ИП Сидорова', 'ул. Примерная, 15', 'Директор', 'maria@test.com', '+7-999-987-65-43')
        `);

        // Тестовые заказы
        await runQuery(`
            INSERT OR IGNORE INTO orders (klient, numer_zamowienia, data_zamowienia, status, laczna_ilosc) VALUES 
            ('Иван Петров', 'ORD001', '2024-01-15', 'pending', 150),
            ('Мария Сидорова', 'ORD002', '2024-01-16', 'completed', 75)
        `);

        // Тестовые рабочие листы
        await runQuery(`
            INSERT OR IGNORE INTO working_sheets (data, kod, nazwa, ilosc, typ, jednostka_miary) VALUES 
            ('2024-01-15', 'PROD001', 'Тестовый продукт 1', 50, 'sprzedaz', 'шт'),
            ('2024-01-16', 'PROD002', 'Тестовый продукт 2', 25, 'sprzedaz', 'кг')
        `);

        console.log('✅ Тестовые данные добавлены');

        // Проверяем структуру
        console.log('🔍 Проверка структуры базы данных...');
        
        const tables = await new Promise((resolve, reject) => {
            db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log('📊 Созданные таблицы:');
        tables.forEach(table => {
            console.log(`  - ${table.name}`);
        });

        // Проверяем количество записей в каждой таблице
        for (const table of tables) {
            const count = await new Promise((resolve, reject) => {
                db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                });
            });
            console.log(`  📋 ${table.name}: ${count} записей`);
        }

        console.log('🎉 База данных enoterra_erp.db успешно инициализирована!');
        console.log('📍 Файл создан по пути:', dbPath);

    } catch (error) {
        console.error('❌ Ошибка при инициализации базы данных:', error);
    } finally {
        db.close();
    }
}

// Запускаем инициализацию
initializeDatabase();

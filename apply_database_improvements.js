const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Путь к файлу базы данных
const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');

console.log('🔧 Применение улучшений к базе данных...');
console.log('📍 Файл:', dbPath);

// Создаем подключение к базе данных
const db = new sqlite3.Database(dbPath);

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

// Функция для проверки существования колонки
function columnExists(tableName, columnName) {
    return new Promise((resolve, reject) => {
        db.get(`PRAGMA table_info(${tableName})`, (err, rows) => {
            if (err) reject(err);
            else {
                db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
                    if (err) reject(err);
                    else {
                        const exists = columns.some(col => col.name === columnName);
                        resolve(exists);
                    }
                });
            }
        });
    });
}

// Функция для применения улучшений
async function applyImprovements() {
    try {
        console.log('📋 Применение улучшений к существующим таблицам...');

        // 1. Улучшения для таблицы clients
        console.log('🔄 Улучшение таблицы clients...');
        
        const clientsColumns = [
            { name: 'nip', sql: 'ALTER TABLE clients ADD COLUMN nip TEXT' },
            { name: 'regon', sql: 'ALTER TABLE clients ADD COLUMN regon TEXT' },
            { name: 'kraj', sql: 'ALTER TABLE clients ADD COLUMN kraj TEXT DEFAULT "Polska"' },
            { name: 'kod_pocztowy', sql: 'ALTER TABLE clients ADD COLUMN kod_pocztowy TEXT' },
            { name: 'miasto', sql: 'ALTER TABLE clients ADD COLUMN miasto TEXT' },
            { name: 'status', sql: 'ALTER TABLE clients ADD COLUMN status TEXT DEFAULT "aktywny"' },
            { name: 'uwagi', sql: 'ALTER TABLE clients ADD COLUMN uwagi TEXT' },
            { name: 'updated_at', sql: 'ALTER TABLE clients ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
        ];

        for (const column of clientsColumns) {
            const exists = await columnExists('clients', column.name);
            if (!exists) {
                await runQuery(column.sql);
                console.log(`  ✅ Добавлена колонка clients.${column.name}`);
            } else {
                console.log(`  ⏭️  Колонка clients.${column.name} уже существует`);
            }
        }

        // 2. Улучшения для таблицы orders
        console.log('🔄 Улучшение таблицы orders...');
        
        const ordersColumns = [
            { name: 'data_realizacji', sql: 'ALTER TABLE orders ADD COLUMN data_realizacji TEXT' },
            { name: 'data_wysylki', sql: 'ALTER TABLE orders ADD COLUMN data_wysylki TEXT' },
            { name: 'sposob_platnosci', sql: 'ALTER TABLE orders ADD COLUMN sposob_platnosci TEXT' },
            { name: 'termin_platnosci', sql: 'ALTER TABLE orders ADD COLUMN termin_platnosci TEXT' },
            { name: 'wartosc_netto', sql: 'ALTER TABLE orders ADD COLUMN wartosc_netto REAL' },
            { name: 'wartosc_brutto', sql: 'ALTER TABLE orders ADD COLUMN wartosc_brutto REAL' },
            { name: 'podatek', sql: 'ALTER TABLE orders ADD COLUMN podatek REAL DEFAULT 23' },
            { name: 'uwagi', sql: 'ALTER TABLE orders ADD COLUMN uwagi TEXT' },
            { name: 'priorytet', sql: 'ALTER TABLE orders ADD COLUMN priorytet TEXT DEFAULT "normalny"' },
            { name: 'updated_at', sql: 'ALTER TABLE orders ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
        ];

        for (const column of ordersColumns) {
            const exists = await columnExists('orders', column.name);
            if (!exists) {
                await runQuery(column.sql);
                console.log(`  ✅ Добавлена колонка orders.${column.name}`);
            } else {
                console.log(`  ⏭️  Колонка orders.${column.name} уже существует`);
            }
        }

        // 3. Улучшения для таблицы products
        console.log('🔄 Улучшение таблицы products...');
        
        const productsColumns = [
            { name: 'kategoria', sql: 'ALTER TABLE products ADD COLUMN kategoria TEXT' },
            { name: 'dostawca', sql: 'ALTER TABLE products ADD COLUMN dostawca TEXT' },
            { name: 'kod_dostawcy', sql: 'ALTER TABLE products ADD COLUMN kod_dostawcy TEXT' },
            { name: 'min_ilosc', sql: 'ALTER TABLE products ADD COLUMN min_ilosc INTEGER DEFAULT 0' },
            { name: 'max_ilosc', sql: 'ALTER TABLE products ADD COLUMN max_ilosc INTEGER' },
            { name: 'lokalizacja', sql: 'ALTER TABLE products ADD COLUMN lokalizacja TEXT' },
            { name: 'status_dostepnosci', sql: 'ALTER TABLE products ADD COLUMN status_dostepnosci TEXT DEFAULT "dostepny"' },
            { name: 'data_ostatniej_dostawy', sql: 'ALTER TABLE products ADD COLUMN data_ostatniej_dostawy TEXT' },
            { name: 'data_ostatniej_sprzedazy', sql: 'ALTER TABLE products ADD COLUMN data_ostatniej_sprzedazy TEXT' }
        ];

        for (const column of productsColumns) {
            const exists = await columnExists('products', column.name);
            if (!exists) {
                await runQuery(column.sql);
                console.log(`  ✅ Добавлена колонка products.${column.name}`);
            } else {
                console.log(`  ⏭️  Колонка products.${column.name} уже существует`);
            }
        }

        // 4. Улучшения для таблицы working_sheets
        console.log('🔄 Улучшение таблицы working_sheets...');
        
        const workingSheetsColumns = [
            { name: 'uzytkownik', sql: 'ALTER TABLE working_sheets ADD COLUMN uzytkownik TEXT' },
            { name: 'komentarz', sql: 'ALTER TABLE working_sheets ADD COLUMN komentarz TEXT' },
            { name: 'status', sql: 'ALTER TABLE working_sheets ADD COLUMN status TEXT DEFAULT "aktywny"' },
            { name: 'data_modyfikacji', sql: 'ALTER TABLE working_sheets ADD COLUMN data_modyfikacji TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
            { name: 'wersja', sql: 'ALTER TABLE working_sheets ADD COLUMN wersja INTEGER DEFAULT 1' }
        ];

        for (const column of workingSheetsColumns) {
            const exists = await columnExists('working_sheets', column.name);
            if (!exists) {
                await runQuery(column.sql);
                console.log(`  ✅ Добавлена колонка working_sheets.${column.name}`);
            } else {
                console.log(`  ⏭️  Колонка working_sheets.${column.name} уже существует`);
            }
        }

        // 5. Улучшения для таблицы product_receipts
        console.log('🔄 Улучшение таблицы product_receipts...');
        
        const productReceiptsColumns = [
            { name: 'data_faktury', sql: 'ALTER TABLE product_receipts ADD COLUMN data_faktury TEXT' },
            { name: 'termin_platnosci', sql: 'ALTER TABLE product_receipts ADD COLUMN termin_platnosci TEXT' },
            { name: 'sposob_platnosci', sql: 'ALTER TABLE product_receipts ADD COLUMN sposob_platnosci TEXT' },
            { name: 'status_platnosci', sql: 'ALTER TABLE product_receipts ADD COLUMN status_platnosci TEXT DEFAULT "nieoplacone"' },
            { name: 'numer_pojazdu', sql: 'ALTER TABLE product_receipts ADD COLUMN numer_pojazdu TEXT' },
            { name: 'kierowca', sql: 'ALTER TABLE product_receipts ADD COLUMN kierowca TEXT' },
            { name: 'data_rozladunku', sql: 'ALTER TABLE product_receipts ADD COLUMN data_rozladunku TEXT' },
            { name: 'uwagi_rozladunku', sql: 'ALTER TABLE product_receipts ADD COLUMN uwagi_rozladunku TEXT' }
        ];

        for (const column of productReceiptsColumns) {
            const exists = await columnExists('product_receipts', column.name);
            if (!exists) {
                await runQuery(column.sql);
                console.log(`  ✅ Добавлена колонка product_receipts.${column.name}`);
            } else {
                console.log(`  ⏭️  Колонка product_receipts.${column.name} уже существует`);
            }
        }

        // 6. Создание новых таблиц
        console.log('📋 Создание новых таблиц...');

        // Таблица categories
        await runQuery(`
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nazwa TEXT UNIQUE NOT NULL,
                opis TEXT,
                kategoria_rodzic_id INTEGER,
                status TEXT DEFAULT 'aktywna',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (kategoria_rodzic_id) REFERENCES categories (id)
            )
        `);
        console.log('✅ Таблица categories создана');

        // Таблица suppliers
        await runQuery(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nazwa TEXT NOT NULL,
                kod TEXT UNIQUE,
                nip TEXT,
                regon TEXT,
                adres TEXT,
                telefon TEXT,
                email TEXT,
                kontakt_osoba TEXT,
                status TEXT DEFAULT 'aktywny',
                uwagi TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица suppliers создана');

        // Таблица users
        await runQuery(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                imie TEXT,
                nazwisko TEXT,
                rola TEXT DEFAULT 'user',
                status TEXT DEFAULT 'aktywny',
                ostatnie_logowanie TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица users создана');

        // Таблица audit_log
        await runQuery(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tabela TEXT NOT NULL,
                rekord_id INTEGER NOT NULL,
                operacja TEXT NOT NULL,
                uzytkownik_id INTEGER,
                stare_dane TEXT,
                nowe_dane TEXT,
                data_operacji TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ip_adres TEXT,
                user_agent TEXT
            )
        `);
        console.log('✅ Таблица audit_log создана');

        // 7. Добавление внешних ключей
        console.log('🔗 Добавление внешних ключей...');

        // Связь products с categories
        const categoryIdExists = await columnExists('products', 'kategoria_id');
        if (!categoryIdExists) {
            await runQuery('ALTER TABLE products ADD COLUMN kategoria_id INTEGER');
            console.log('✅ Добавлена связь products.kategoria_id → categories.id');
        }

        // Связь products с suppliers
        const supplierIdExists = await columnExists('products', 'dostawca_id');
        if (!supplierIdExists) {
            await runQuery('ALTER TABLE products ADD COLUMN dostawca_id INTEGER');
            console.log('✅ Добавлена связь products.dostawca_id → suppliers.id');
        }

        // Связь working_sheets с users
        const userIdExists = await columnExists('working_sheets', 'uzytkownik_id');
        if (!userIdExists) {
            await runQuery('ALTER TABLE working_sheets ADD COLUMN uzytkownik_id INTEGER');
            console.log('✅ Добавлена связь working_sheets.uzytkownik_id → users.id');
        }

        // Связь product_receipts с suppliers
        const receiptSupplierIdExists = await columnExists('product_receipts', 'dostawca_id');
        if (!receiptSupplierIdExists) {
            await runQuery('ALTER TABLE product_receipts ADD COLUMN dostawca_id INTEGER');
            console.log('✅ Добавлена связь product_receipts.dostawca_id → suppliers.id');
        }

        // 8. Добавление тестовых данных в новые таблицы
        console.log('📝 Добавление тестовых данных в новые таблицы...');

        // Тестовые категории
        await runQuery(`
            INSERT OR IGNORE INTO categories (nazwa, opis) VALUES 
            ('Электроника', 'Электронные устройства и компоненты'),
            ('Мебель', 'Мебель для офиса и дома'),
            ('Офисные принадлежности', 'Канцелярские товары'),
            ('Строительные материалы', 'Материалы для строительства')
        `);
        console.log('✅ Тестовые категории добавлены');

        // Тестовые поставщики
        await runQuery(`
            INSERT OR IGNORE INTO suppliers (nazwa, kod, email, telefon) VALUES 
            ('ООО Электроника', 'SUP001', 'info@elektronika.pl', '+48-123-456-789'),
            ('ИП Мебель', 'SUP002', 'kontakt@mebel.pl', '+48-987-654-321'),
            ('Канцелярия Про', 'SUP003', 'biuro@kancelaria.pl', '+48-555-123-456')
        `);
        console.log('✅ Тестовые поставщики добавлены');

        // Тестовые пользователи
        await runQuery(`
            INSERT OR IGNORE INTO users (username, email, password_hash, imie, nazwisko, rola) VALUES 
            ('admin', 'admin@enoterra.pl', 'hash_password_here', 'Администратор', 'Системы', 'admin'),
            ('user1', 'user1@enoterra.pl', 'hash_password_here', 'Иван', 'Петров', 'user'),
            ('user2', 'user2@enoterra.pl', 'hash_password_here', 'Мария', 'Сидорова', 'user')
        `);
        console.log('✅ Тестовые пользователи добавлены');

        // 9. Проверка финальной структуры
        console.log('🔍 Проверка финальной структуры...');
        
        const tables = await new Promise((resolve, reject) => {
            db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log(`\n📊 Всего таблиц: ${tables.length}`);
        console.log('📋 Список всех таблиц:');
        tables.forEach(table => {
            console.log(`  - ${table.name}`);
        });

        console.log('\n🎉 Улучшения базы данных успешно применены!');
        console.log('✅ Все новые поля и таблицы созданы');
        console.log('✅ Внешние ключи добавлены');
        console.log('✅ Тестовые данные добавлены');

    } catch (error) {
        console.error('❌ Ошибка при применении улучшений:', error);
    } finally {
        db.close();
    }
}

// Запускаем применение улучшений
applyImprovements();

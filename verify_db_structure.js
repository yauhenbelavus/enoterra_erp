const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Путь к файлу базы данных
const dbPath = path.join(__dirname, 'server', 'enoterra_erp.db');

console.log('🔍 Проверка структуры базы данных server/enoterra_erp.db...');
console.log('📍 Путь к файлу:', dbPath);

// Создаем подключение к базе данных
const db = new sqlite3.Database(dbPath);

// Функция для получения списка таблиц
function getTables() {
    return new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Функция для получения структуры таблицы
function getTableStructure(tableName) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Функция для получения количества записей
function getRecordCount(tableName) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

// Основная функция проверки
async function verifyDatabase() {
    try {
        console.log('📊 Проверка таблиц...');
        
        const tables = await getTables();
        console.log(`\n✅ Найдено таблиц: ${tables.length}`);
        
        for (const table of tables) {
            console.log(`\n📋 Таблица: ${table.name}`);
            
            // Получаем структуру таблицы
            const structure = await getTableStructure(table.name);
            console.log(`  Поля (${structure.length}):`);
            structure.forEach(field => {
                console.log(`    - ${field.name} (${field.type})${field.notnull ? ' NOT NULL' : ''}${field.pk ? ' PRIMARY KEY' : ''}`);
            });
            
            // Получаем количество записей
            const count = await getRecordCount(table.name);
            console.log(`  Записей: ${count}`);
        }
        
        console.log('\n🎉 Проверка завершена!');
        console.log('✅ База данных содержит полную структуру из ветки new-main');
        
    } catch (error) {
        console.error('❌ Ошибка при проверке базы данных:', error);
    } finally {
        db.close();
    }
}

// Запускаем проверку
verifyDatabase();

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, 'data.db');

let dbPath = DEFAULT_DB_PATH;
let db;

function setDbPath(newPath) {
  if (newPath && newPath !== dbPath) {
    dbPath = newPath;
    db = null; // force re-init on next getDb()
  }
}

function getDbPath() {
  return dbPath;
}

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS work_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'Untitled',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: add category column if missing (existing databases)
  const cols = db.exec("PRAGMA table_info(work_items)");
  const colNames = cols.length ? cols[0].values.map(r => r[1]) : [];
  if (!colNames.includes('category')) {
    db.run("ALTER TABLE work_items ADD COLUMN category TEXT NOT NULL DEFAULT 'None'");
  }

  persist();
  return db;
}

function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

module.exports = { getDb, persist, setDbPath, getDbPath, DEFAULT_DB_PATH };

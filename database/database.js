const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const databaseFolder = __dirname;
if (!fs.existsSync(databaseFolder)) {
  fs.mkdirSync(databaseFolder, { recursive: true });
}

const db = new Database(path.join(databaseFolder, "tattva.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student'
      CHECK(role IN ('student', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);


// itexamportal Information Technology study materials
db.exec(`
  CREATE TABLE IF NOT EXISTS it_study_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    content TEXT DEFAULT '',
    file_url TEXT DEFAULT '',
    material_type TEXT NOT NULL DEFAULT 'Notes',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
module.exports = db;


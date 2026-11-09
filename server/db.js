const path = require("path");
const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const schema = require("./schema");

let db = null;
let sqlite = null;

async function initDb(userDataPath) {
  const dbPath = path.join(userDataPath, "urlinc.db");
  sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema });

  runMigrations(sqlite);

  console.log(`Database initialized at ${dbPath}`);
  return db;
}

function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnail TEXT,
      duration INTEGER,
      description TEXT,
      tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT 'local',
      name TEXT NOT NULL DEFAULT 'You',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    INSERT OR IGNORE INTO users (id, name) VALUES ('local', 'You');
  `);
}

function getDb() {
  if (!db) throw new Error("Database not initialized — call initDb first");
  return db;
}

function getSqlite() {
  if (!sqlite) throw new Error("SQLite not initialized — call initDb first");
  return sqlite;
}

module.exports = { initDb, getDb, getSqlite };

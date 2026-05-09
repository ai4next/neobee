import BetterSqlite3 from 'better-sqlite3';
import { getDbPath, ensureDbDir } from './config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readSqlFile(filename: string): string {
  return readFileSync(join(__dirname, 'schema', filename), 'utf-8');
}

let db: BetterSqlite3.Database;

export function getDb(): BetterSqlite3.Database {
  if (!db) {
    ensureDbDir();
    db = new BetterSqlite3(getDbPath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(database: BetterSqlite3.Database): void {
  database.exec(readSqlFile('system.sql'));
  database.exec(readSqlFile('checkpoint.sql'));
  database.exec(readSqlFile('task-tracking.sql'));
  database.exec(readSqlFile('deep-research.sql'));
  database.exec(readSqlFile('expert-creation.sql'));
  database.exec(readSqlFile('insight-refinement.sql'));
  database.exec(readSqlFile('cross-review.sql'));
  database.exec(readSqlFile('idea-synthesis.sql'));

  // Migration: add cross_review_cursor column to existing databases
  try {
    database.exec('ALTER TABLE session_checkpoint ADD COLUMN cross_review_cursor TEXT');
  } catch {
    // Column already exists — ignore
  }
}

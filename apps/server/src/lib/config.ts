import { randomUUID } from 'crypto';
import fs from 'fs';

let dataDir: string;
let dbPath: string;

export function getDataDir(): string {
  if (!dataDir) {
    dataDir = `${process.env.HOME}/.neobee/db`;
  }
  return dataDir;
}

export function ensureDataDir(): void {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
}

export function getDbPath(): string {
  if (!dbPath) {
    dbPath = `${getDataDir()}/neobee.db`;
  }
  return dbPath;
}

export function ensureDbDir(): void {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
}

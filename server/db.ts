import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const DB_PATH = join(import.meta.dirname, 'dashboard.db');
const USERS_JSON = join(import.meta.dirname, 'users.json');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL,
    role_id TEXT NOT NULL,
    content BLOB,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (uploaded_by) REFERENCES users(username)
  );

  CREATE TABLE IF NOT EXISTS parsed_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    data TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS file_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    column_name TEXT NOT NULL,
    column_type TEXT NOT NULL DEFAULT 'text',
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );
`);

// ── Seed users from users.json if users table is empty ──

const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
if (userCount === 0 && existsSync(USERS_JSON)) {
  try {
    const seedUsers = JSON.parse(readFileSync(USERS_JSON, 'utf-8'));
    const insert = db.prepare(
      'INSERT INTO users (username, password, display_name, role_id) VALUES (?, ?, ?, ?)'
    );
    const seedMany = db.transaction((users: any[]) => {
      for (const u of users) {
        insert.run(u.username, u.password, u.displayName, u.roleId);
      }
    });
    seedMany(seedUsers);
    console.log(`[DB] Seeded ${seedUsers.length} users from users.json`);
  } catch (e) {
    console.warn('[DB] Failed to seed users from users.json:', e);
  }
}

// ── User queries ──

export interface DbUser {
  id: number;
  username: string;
  password: string;
  display_name: string;
  role_id: string;
  created_at: string;
}

export function findUserByCredentials(username: string, password: string): DbUser | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password) as DbUser | undefined;
}

export function findUserByUsername(username: string): DbUser | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as DbUser | undefined;
}

export function createUser(username: string, password: string, displayName: string, roleId: string): DbUser {
  db.prepare(
    'INSERT INTO users (username, password, display_name, role_id) VALUES (?, ?, ?, ?)'
  ).run(username, password, displayName, roleId);
  return findUserByUsername(username)!;
}

// ── File queries ──

export interface DbFile {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  uploaded_by: string;
  role_id: string;
  created_at: string;
}

export function insertFile(
  filename: string,
  originalName: string,
  mimeType: string,
  size: number,
  uploadedBy: string,
  roleId: string,
  content: Buffer
): DbFile {
  const result = db.prepare(
    'INSERT INTO files (filename, original_name, mime_type, size, uploaded_by, role_id, content) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(filename, originalName, mimeType, size, uploadedBy, roleId, content);
  return db.prepare('SELECT id, filename, original_name, mime_type, size, uploaded_by, role_id, created_at FROM files WHERE id = ?').get(result.lastInsertRowid) as DbFile;
}

export function getFilesByRole(roleId: string): DbFile[] {
  return db.prepare(
    'SELECT id, filename, original_name, mime_type, size, uploaded_by, role_id, created_at FROM files WHERE role_id = ? ORDER BY created_at DESC'
  ).all(roleId) as DbFile[];
}

export function getAllFiles(): DbFile[] {
  return db.prepare(
    'SELECT id, filename, original_name, mime_type, size, uploaded_by, role_id, created_at FROM files ORDER BY created_at DESC'
  ).all() as DbFile[];
}

export function getFileById(id: number): (DbFile & { content: Buffer }) | undefined {
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id) as (DbFile & { content: Buffer }) | undefined;
}

export function deleteFile(id: number): boolean {
  const result = db.prepare('DELETE FROM files WHERE id = ?').run(id);
  return result.changes > 0;
}

// ── Parsed data queries ──

export function insertParsedRows(fileId: number, columns: { name: string; type: string }[], rows: Record<string, unknown>[]) {
  const deleteOld = db.prepare('DELETE FROM parsed_data WHERE file_id = ?');
  const deleteCols = db.prepare('DELETE FROM file_columns WHERE file_id = ?');
  const insertCol = db.prepare('INSERT INTO file_columns (file_id, column_name, column_type) VALUES (?, ?, ?)');
  const insertRow = db.prepare('INSERT INTO parsed_data (file_id, row_index, data) VALUES (?, ?, ?)');

  const batch = db.transaction(() => {
    deleteOld.run(fileId);
    deleteCols.run(fileId);
    for (const col of columns) {
      insertCol.run(fileId, col.name, col.type);
    }
    for (let i = 0; i < rows.length; i++) {
      insertRow.run(fileId, i, JSON.stringify(rows[i]));
    }
  });
  batch();
}

export function getParsedRows(fileId: number): Record<string, unknown>[] {
  const rows = db.prepare('SELECT data FROM parsed_data WHERE file_id = ? ORDER BY row_index').all(fileId) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data));
}

export function getFileColumns(fileId: number): { column_name: string; column_type: string }[] {
  return db.prepare('SELECT column_name, column_type FROM file_columns WHERE file_id = ?').all(fileId) as { column_name: string; column_type: string }[];
}

export function getFileSummary(fileId: number) {
  const rowCount = (db.prepare('SELECT COUNT(*) as count FROM parsed_data WHERE file_id = ?').get(fileId) as any).count;
  const columns = getFileColumns(fileId);
  return { rowCount, columns };
}

export default db;

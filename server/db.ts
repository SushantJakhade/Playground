import postgres from 'postgres';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileAnalysisSummary, FileDataKind, FileParseStatus, StoredFileAnalysis } from '../src/types.js';

// ── Connection ──

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required. Set it in .env');
}

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

const USERS_JSON = join(import.meta.dirname, 'users.json');

// ── Schema bootstrap ──

export async function initDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS files (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL REFERENCES users(username),
      role_id TEXT NOT NULL,
      content BYTEA,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS parsed_data (
      id SERIAL PRIMARY KEY,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      data JSONB NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS file_columns (
      id SERIAL PRIMARY KEY,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      column_name TEXT NOT NULL,
      column_type TEXT NOT NULL DEFAULT 'text'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS file_analysis (
      file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
      file_kind TEXT NOT NULL,
      parse_status TEXT NOT NULL,
      summary_json JSONB NOT NULL,
      insights_json JSONB NOT NULL,
      extracted_text TEXT,
      generated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Seed users from users.json if users table is empty
  const [{ count }] = await sql<[{ count: number }]>`SELECT COUNT(*)::int AS count FROM users`;
  if (count === 0 && existsSync(USERS_JSON)) {
    try {
      const seedUsers = JSON.parse(readFileSync(USERS_JSON, 'utf-8'));
      for (const u of seedUsers) {
        await sql`
          INSERT INTO users (username, password, display_name, role_id)
          VALUES (${u.username}, ${u.password}, ${u.displayName}, ${u.roleId})
          ON CONFLICT (username) DO NOTHING
        `;
      }
      console.log(`[DB] Seeded ${seedUsers.length} users from users.json`);
    } catch (e) {
      console.warn('[DB] Failed to seed users from users.json:', e);
    }
  }

  console.log('[DB] PostgreSQL schema initialized (Supabase)');
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

export async function findUserByCredentials(username: string, password: string): Promise<DbUser | undefined> {
  const rows = await sql<DbUser[]>`
    SELECT * FROM users WHERE username = ${username} AND password = ${password}
  `;
  return rows[0];
}

export async function findUserByUsername(username: string): Promise<DbUser | undefined> {
  const rows = await sql<DbUser[]>`
    SELECT * FROM users WHERE username = ${username}
  `;
  return rows[0];
}

export async function createUser(username: string, password: string, displayName: string, roleId: string): Promise<DbUser> {
  const rows = await sql<DbUser[]>`
    INSERT INTO users (username, password, display_name, role_id)
    VALUES (${username}, ${password}, ${displayName}, ${roleId})
    RETURNING *
  `;
  return rows[0];
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

export async function insertFile(
  filename: string,
  originalName: string,
  mimeType: string,
  size: number,
  uploadedBy: string,
  roleId: string,
  content: Buffer
): Promise<DbFile> {
  const rows = await sql<DbFile[]>`
    INSERT INTO files (filename, original_name, mime_type, size, uploaded_by, role_id, content)
    VALUES (${filename}, ${originalName}, ${mimeType}, ${size}, ${uploadedBy}, ${roleId}, ${content})
    RETURNING id, filename, original_name, mime_type, size, uploaded_by, role_id, created_at
  `;
  return rows[0];
}

export async function getFilesByRole(roleId: string): Promise<DbFile[]> {
  return sql<DbFile[]>`
    SELECT id, filename, original_name, mime_type, size, uploaded_by, role_id, created_at
    FROM files WHERE role_id = ${roleId} ORDER BY created_at DESC
  `;
}

export async function getAllFiles(): Promise<DbFile[]> {
  return sql<DbFile[]>`
    SELECT id, filename, original_name, mime_type, size, uploaded_by, role_id, created_at
    FROM files ORDER BY created_at DESC
  `;
}

export async function getFileById(id: number): Promise<(DbFile & { content: Buffer }) | undefined> {
  const rows = await sql<(DbFile & { content: Buffer })[]>`
    SELECT * FROM files WHERE id = ${id}
  `;
  return rows[0];
}

export async function deleteFile(id: number): Promise<boolean> {
  const result = await sql`DELETE FROM files WHERE id = ${id}`;
  return result.count > 0;
}

// ── Parsed data queries ──

export async function insertParsedRows(fileId: number, columns: { name: string; type: string }[], rows: Record<string, unknown>[]) {
  await sql`DELETE FROM parsed_data WHERE file_id = ${fileId}`;
  await sql`DELETE FROM file_columns WHERE file_id = ${fileId}`;

  for (const col of columns) {
    await sql`
      INSERT INTO file_columns (file_id, column_name, column_type)
      VALUES (${fileId}, ${col.name}, ${col.type})
    `;
  }

  // Batch insert rows in chunks to avoid oversized queries
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((row, idx) => ({
      file_id: fileId,
      row_index: i + idx,
      data: sql.json(row as any),
    }));
    await sql`INSERT INTO parsed_data ${sql(values)}`;
  }
}

export async function getParsedRows(fileId: number): Promise<Record<string, unknown>[]> {
  const rows = await sql<{ data: Record<string, unknown> }[]>`
    SELECT data FROM parsed_data WHERE file_id = ${fileId} ORDER BY row_index
  `;
  return rows.map((r) => r.data);
}

export async function getFileColumns(fileId: number): Promise<{ column_name: string; column_type: string }[]> {
  return sql<{ column_name: string; column_type: string }[]>`
    SELECT column_name, column_type FROM file_columns WHERE file_id = ${fileId}
  `;
}

export async function getFileSummary(fileId: number) {
  const [{ count }] = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count FROM parsed_data WHERE file_id = ${fileId}
  `;
  const columns = await getFileColumns(fileId);
  return { rowCount: count, columns };
}

// ── File analysis queries ──

export async function upsertFileAnalysis(
  fileId: number,
  fileKind: FileDataKind,
  parseStatus: FileParseStatus,
  summary: FileAnalysisSummary,
  insights: string[],
  extractedText: string | null,
): Promise<StoredFileAnalysis> {
  await sql`
    INSERT INTO file_analysis (
      file_id, file_kind, parse_status, summary_json, insights_json, extracted_text, generated_at
    ) VALUES (
      ${fileId}, ${fileKind}, ${parseStatus},
      ${sql.json(summary as any)}, ${sql.json(insights as any)},
      ${extractedText}, NOW()
    )
    ON CONFLICT (file_id) DO UPDATE SET
      file_kind = EXCLUDED.file_kind,
      parse_status = EXCLUDED.parse_status,
      summary_json = EXCLUDED.summary_json,
      insights_json = EXCLUDED.insights_json,
      extracted_text = EXCLUDED.extracted_text,
      generated_at = NOW()
  `;

  return (await getFileAnalysis(fileId))!;
}

export async function getFileAnalysis(fileId: number): Promise<StoredFileAnalysis | undefined> {
  const rows = await sql<{
    file_id: number;
    file_kind: FileDataKind;
    parse_status: FileParseStatus;
    summary_json: FileAnalysisSummary;
    insights_json: string[];
    extracted_text: string | null;
    generated_at: string;
  }[]>`
    SELECT file_id, file_kind, parse_status, summary_json, insights_json, extracted_text, generated_at
    FROM file_analysis WHERE file_id = ${fileId}
  `;

  const row = rows[0];
  if (!row) return undefined;

  return {
    fileId: row.file_id,
    fileKind: row.file_kind,
    parseStatus: row.parse_status,
    summary: row.summary_json,
    insights: row.insights_json,
    extractedText: row.extracted_text,
    generatedAt: row.generated_at,
  };
}

// ── Graceful shutdown ──

export async function closeDatabase() {
  await sql.end();
}

export default sql;

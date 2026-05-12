import { chmodSync, mkdirSync, statSync } from 'node:fs';
import Database from 'better-sqlite3';
import { CONTEXTOR_DIR, DB_PATH } from '../utils/home.js';
import { nowMs } from '../utils/time.js';

const SCHEMA_VERSION = '1';
const DEFAULT_RULES = [
  '.claude/',
  '.cursor/',
  '.codebuddy/',
  '.codex/',
  '.gemini/',
  '.vscode/',
  '.env*',
  'AGENTS.md',
  'CLAUDE.md',
];

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alias           TEXT NOT NULL UNIQUE,
  remote_url      TEXT UNIQUE,
  root_path_hint  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_blobs (
  hash               TEXT PRIMARY KEY,
  content            BLOB NOT NULL,
  size               INTEGER NOT NULL,
  encryption_method  TEXT NOT NULL DEFAULT 'none',
  created_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS managed_files (
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  blob_hash    TEXT NOT NULL REFERENCES file_blobs(hash),
  mode         INTEGER NOT NULL,
  is_dir       INTEGER NOT NULL DEFAULT 0,
  saved_at     INTEGER NOT NULL,
  PRIMARY KEY (project_id, path)
);

CREATE TABLE IF NOT EXISTS manifest_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('include','exclude')),
  created_at   INTEGER NOT NULL,
  UNIQUE (project_id, path, kind)
);

CREATE TABLE IF NOT EXISTS global_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern      TEXT NOT NULL UNIQUE,
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_managed_files_project ON managed_files(project_id);
CREATE INDEX IF NOT EXISTS idx_manifest_project ON manifest_entries(project_id);
`;

function ensureDir(): void {
  mkdirSync(CONTEXTOR_DIR, { recursive: true, mode: 0o700 });
  try {
    chmodSync(CONTEXTOR_DIR, 0o700);
  } catch {
    /* best-effort */
  }
}

function ensureDbPerm(path: string): void {
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort */
  }
}

export type Db = Database.Database;

export function openDb(path: string = DB_PATH): Db {
  ensureDir();
  const db = new Database(path);
  ensureDbPerm(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  seedMeta(db);
  seedDefaultRules(db);
  return db;
}

function seedMeta(db: Db): void {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('schema_version', SCHEMA_VERSION);
  }
}

function seedDefaultRules(db: Db): void {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO global_rules(pattern, is_default, created_at) VALUES (?, 1, ?)',
  );
  const now = nowMs();
  const tx = db.transaction((patterns: string[]) => {
    for (const p of patterns) stmt.run(p, now);
  });
  tx(DEFAULT_RULES);
}

export function dbFileSize(path: string = DB_PATH): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

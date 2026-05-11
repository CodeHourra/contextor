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

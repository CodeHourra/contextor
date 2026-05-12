import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gcOrphanBlobs, hashBuffer, putBlob } from '../core/blob.js';
import { expandManifest, listManifest } from '../core/manifest.js';
import { detectProjectRoot, resolveProjectDiskRoot } from '../core/project.js';
import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';
import type { ProjectRow, Reporter } from './types.js';

export const LARGE_FILE_BYTES = 10 * 1024 * 1024;

export type SaveOptions = {
  cwd: string;
  message?: string;
  allowLarge: boolean;
  dryRun: boolean;
};

export type SaveResult = {
  added: number;
  updated: number;
  removed: number;
  skippedLarge: number;
};

function isOversized(e: { isDir: boolean; size: number }): boolean {
  return !e.isDir && e.size > LARGE_FILE_BYTES;
}

export function lookupProjectByCwd(db: Db, cwd: string): ProjectRow | null | 'unknown' {
  const { root, remote } = detectProjectRoot(cwd);
  if (remote) {
    const row = db.prepare('SELECT * FROM projects WHERE remote_url = ?').get(remote) as
      | ProjectRow
      | undefined;
    return row ?? null;
  }
  const resolvedRoot = resolve(root);
  const rows = db
    .prepare('SELECT * FROM projects WHERE remote_url IS NULL AND root_path_hint IS NOT NULL')
    .all() as ProjectRow[];
  const matches = rows.filter((p) => resolve(p.root_path_hint as string) === resolvedRoot);
  if (matches.length > 1) return 'unknown';
  if (matches.length === 1) {
    const only = matches[0];
    if (only) return only;
  }
  const byCwd = db.prepare('SELECT * FROM projects WHERE root_path_hint = ?').get(resolve(cwd)) as
    | ProjectRow
    | undefined;
  return byCwd ?? null;
}

export async function save(db: Db, opts: SaveOptions, reporter: Reporter): Promise<SaveResult> {
  const project = lookupProjectByCwd(db, opts.cwd);
  if (project === 'unknown') {
    throw new Error('Ambiguous project: multiple projects match this directory.');
  }
  if (!project) {
    throw new Error('Not in a known project. Run `contextor init` first.');
  }

  const projectRoot = resolveProjectDiskRoot(project, opts.cwd);
  const manifest = listManifest(db, project.id);
  const expanded = expandManifest(projectRoot, manifest);
  const fullExpandedRel = new Set(expanded.map((e) => e.rel));

  let skippedLarge = 0;
  for (const e of expanded) {
    if (!isOversized(e)) continue;
    if (opts.allowLarge) continue;
    skippedLarge++;
    reporter.warn(
      `Skipping large file (${(e.size / 1024 / 1024).toFixed(1)} MB > ${LARGE_FILE_BYTES / 1024 / 1024} MB): ${e.rel} — pass --allow-large to include.`,
    );
  }

  const toProcess = expanded.filter((e) => opts.allowLarge || !isOversized(e));

  const existing = db
    .prepare('SELECT path, blob_hash FROM managed_files WHERE project_id = ?')
    .all(project.id) as Array<{ path: string; blob_hash: string }>;
  const existingMap = new Map(existing.map((r) => [r.path, r.blob_hash]));

  let added = 0;
  let updated = 0;
  const removedPaths: string[] = [];

  type PlanRow = { rel: string; hash: string; mode: number; isDir: boolean; buf: Buffer };
  const plan: PlanRow[] = [];

  for (const e of toProcess) {
    const buf = e.isDir ? Buffer.alloc(0) : readFileSync(e.abs);
    const hash = hashBuffer(buf);
    const cur = existingMap.get(e.rel);
    if (cur === undefined) added++;
    else if (cur !== hash) updated++;
    plan.push({ rel: e.rel, hash, mode: e.mode, isDir: e.isDir, buf });
  }

  for (const ex of existing) {
    if (!fullExpandedRel.has(ex.path)) removedPaths.push(ex.path);
  }
  const removed = removedPaths.length;

  // 空变更：无增删改；skippedLarge 仅警告跳过，不写库
  if (added === 0 && updated === 0 && removed === 0) {
    if (skippedLarge === 0) reporter.info('No changes — nothing to save.');
    return { added: 0, updated: 0, removed: 0, skippedLarge };
  }

  if (opts.dryRun) {
    return { added, updated, removed, skippedLarge };
  }

  const insertManaged = db.prepare(
    `INSERT INTO managed_files (project_id, path, blob_hash, mode, is_dir, saved_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, path) DO UPDATE SET blob_hash = excluded.blob_hash,
       mode = excluded.mode, is_dir = excluded.is_dir, saved_at = excluded.saved_at`,
  );
  const deleteManaged = db.prepare('DELETE FROM managed_files WHERE project_id = ? AND path = ?');
  const updateProj = db.prepare(
    'UPDATE projects SET updated_at = ?, root_path_hint = ? WHERE id = ?',
  );
  const now = nowMs();

  const tx = db.transaction(() => {
    for (const p of plan) {
      const realHash = putBlob(db, p.buf);
      insertManaged.run(project.id, p.rel, realHash, p.mode, p.isDir ? 1 : 0, now);
    }
    for (const rel of removedPaths) deleteManaged.run(project.id, rel);
    updateProj.run(now, projectRoot, project.id);
    if (opts.message) {
      db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(
        `last_save_message:${project.id}`,
        opts.message,
      );
    }
  });
  tx();

  const removedBlobs = gcOrphanBlobs(db);
  if (removedBlobs > 0) reporter.info(`GC: removed ${removedBlobs} orphan blobs`);

  return { added, updated, removed, skippedLarge };
}

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hashBuffer } from '../core/blob.js';
import { type Classification, classifyConflicts } from '../core/conflict.js';
import { expandManifest, listManifest } from '../core/manifest.js';
import { detectProjectRoot } from '../core/project.js';
import type { Db } from '../db/index.js';
import type { ProjectRow } from './types.js';

type ManagedRow = {
  path: string;
  blob_hash: string;
  mode: number;
  is_dir: number;
};

function localHashForRow(projectRoot: string, row: ManagedRow): string | null {
  const abs = join(projectRoot, row.path);
  if (!existsSync(abs)) return null;
  if (row.is_dir) {
    try {
      if (!statSync(abs).isDirectory()) return null;
    } catch {
      return null;
    }
    return hashBuffer(Buffer.alloc(0));
  }
  try {
    const buf = readFileSync(abs);
    return hashBuffer(buf);
  } catch {
    return null;
  }
}

function mergeUntrackedFromManifest(
  db: Db,
  projectId: number,
  projectRoot: string,
  fullManaged: Set<string>,
  local: Map<string, string | null>,
): void {
  const expanded = expandManifest(projectRoot, listManifest(db, projectId));
  for (const e of expanded) {
    if (fullManaged.has(e.rel)) continue;
    if (local.has(e.rel)) continue;
    try {
      if (e.isDir) {
        if (!existsSync(e.abs)) continue;
        if (!statSync(e.abs).isDirectory()) continue;
        local.set(e.rel, hashBuffer(Buffer.alloc(0)));
      } else {
        const buf = readFileSync(e.abs);
        local.set(e.rel, hashBuffer(buf));
      }
    } catch {
      /* skip missing / unreadable */
    }
  }
}

/** 与 restore 一致：managed_files 为 target，磁盘 + manifest 展开合并为 local，再交给 classifyConflicts。 */
export function status(db: Db, projectId: number, cwd: string): Classification {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | ProjectRow
    | undefined;
  if (!project) throw new Error(`Project id ${projectId} not found.`);

  const { root } = detectProjectRoot(cwd);
  const projectRoot = resolve(project.root_path_hint ?? root);

  const allRows = db
    .prepare('SELECT path, blob_hash, mode, is_dir FROM managed_files WHERE project_id = ?')
    .all(projectId) as ManagedRow[];

  const fullManaged = new Set(allRows.map((r) => r.path));
  const target = allRows.map((t) => ({ rel: t.path, hash: t.blob_hash }));

  const local = new Map<string, string | null>();
  for (const row of allRows) {
    local.set(row.path, localHashForRow(projectRoot, row));
  }
  mergeUntrackedFromManifest(db, projectId, projectRoot, fullManaged, local);

  return classifyConflicts(target, local);
}

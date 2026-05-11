import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPatch } from 'diff';
import { getBlob, hashBuffer } from '../core/blob.js';
import { safeJoin } from '../core/paths.js';
import { detectProjectRoot } from '../core/project.js';
import type { Db } from '../db/index.js';
import type { ProjectRow } from './types.js';

function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export function diff(db: Db, projectId: number, cwd: string, rel: string): string {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | ProjectRow
    | undefined;
  if (!project) throw new Error(`Project id ${projectId} not found.`);

  const { root } = detectProjectRoot(cwd);
  const projectRoot = resolve(project.root_path_hint ?? root);

  const row = db
    .prepare('SELECT blob_hash FROM managed_files WHERE project_id = ? AND path = ?')
    .get(projectId, rel) as { blob_hash: string } | undefined;
  if (!row) throw new Error(`Path "${rel}" is not managed for this project.`);

  const stored = getBlob(db, row.blob_hash);
  if (!stored) throw new Error(`Missing blob ${row.blob_hash} for ${rel}`);

  let local: Buffer;
  try {
    local = readFileSync(safeJoin(projectRoot, rel));
  } catch {
    return '(missing locally)';
  }

  if (isBinary(stored) || isBinary(local)) {
    const dbHash = hashBuffer(stored);
    const localHash = hashBuffer(local);
    return `<binary file: hash db=${dbHash} local=${localHash}, size db=${stored.length} local=${local.length}>`;
  }

  return createPatch(rel, stored.toString('utf8'), local.toString('utf8'), 'db', 'local');
}

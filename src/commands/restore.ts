import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import picomatch from 'picomatch';
import { getBlob, hashBuffer } from '../core/blob.js';
import { classifyConflicts } from '../core/conflict.js';
import { expandManifest, listManifest } from '../core/manifest.js';
import { safeJoin } from '../core/paths.js';
import { resolveProjectDiskRoot } from '../core/project.js';
import { backupToTrash } from '../core/trash.js';
import type { Db } from '../db/index.js';
import { TRASH_DIR } from '../utils/home.js';
import { nowMs } from '../utils/time.js';
import { lookupProjectByCwd } from './save.js';
import type { ProjectRow, Reporter } from './types.js';

export type RestoreOptions = {
  cwd: string;
  /** TUI / 调用方显式指定项目时优先于 cwd 解析（避免 lookup 失败） */
  projectId?: number;
  alias?: string;
  yes: boolean;
  noBackup: boolean;
  only?: string;
  dryRun: boolean;
  /** 集成测试注入；默认 `TRASH_DIR` */
  trashRoot?: string;
};

export type RestoreResult = {
  restored: number;
  created: string[];
  changed: string[];
  untrackedKept: string[];
  dryRun: boolean;
};

type ManagedRow = {
  path: string;
  blob_hash: string;
  mode: number;
  is_dir: number;
};

function resolveProject(db: Db, opts: RestoreOptions): ProjectRow {
  if (opts.projectId != null) {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(opts.projectId) as
      | ProjectRow
      | undefined;
    if (!row) throw new Error(`Project id ${opts.projectId} not found.`);
    return row;
  }
  if (opts.alias) {
    const row = db.prepare('SELECT * FROM projects WHERE alias = ?').get(opts.alias) as
      | ProjectRow
      | undefined;
    if (!row) throw new Error(`Project "${opts.alias}" not found.`);
    return row;
  }
  const found = lookupProjectByCwd(db, opts.cwd);
  if (found === 'unknown') {
    throw new Error('Ambiguous project: multiple projects match this directory.');
  }
  if (!found) {
    throw new Error('未找到项目, 请用 contextor restore <alias>');
  }
  return found;
}

function localHashForRow(root: string, row: ManagedRow): string | null {
  const abs = safeJoin(root, row.path);
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

function printRestoreSummary(
  reporter: Reporter,
  cls: { created: string[]; changed: string[]; untracked: string[] },
): void {
  reporter.info(`Will create:    ${cls.created.length}`);
  if (cls.created.length) for (const p of cls.created) reporter.info(`  + ${p}`);
  reporter.info(`Will overwrite: ${cls.changed.length}`);
  if (cls.changed.length) for (const p of cls.changed) reporter.info(`  ~ ${p}`);
  reporter.info(`Keep local:     ${cls.untracked.length} (not in snapshot, left unchanged)`);
  if (cls.untracked.length) for (const p of cls.untracked) reporter.info(`  · ${p}`);
}

export async function restore(
  db: Db,
  opts: RestoreOptions,
  reporter: Reporter,
): Promise<RestoreResult> {
  const project = resolveProject(db, opts);
  const projectRoot = resolveProjectDiskRoot(project, opts.cwd);

  const allRows = db
    .prepare('SELECT path, blob_hash, mode, is_dir FROM managed_files WHERE project_id = ?')
    .all(project.id) as ManagedRow[];

  const onlyMatch = opts.only ? picomatch(opts.only, { dot: true }) : null;
  const filtered = onlyMatch ? allRows.filter((r) => onlyMatch(r.path)) : allRows;

  const fullManaged = new Set(allRows.map((r) => r.path));
  const target = filtered.map((t) => ({ rel: t.path, hash: t.blob_hash }));

  const local = new Map<string, string | null>();
  for (const row of filtered) {
    local.set(row.path, localHashForRow(projectRoot, row));
  }
  mergeUntrackedFromManifest(db, project.id, projectRoot, fullManaged, local);

  const cls = classifyConflicts(target, local);
  printRestoreSummary(reporter, cls);

  if (opts.dryRun) {
    return {
      restored: 0,
      created: cls.created,
      changed: cls.changed,
      untrackedKept: cls.untracked,
      dryRun: true,
    };
  }

  if (cls.changed.length > 0 && !opts.yes) {
    const ok = await reporter.confirm('Proceed?');
    if (!ok) throw new Error('cancelled by user');
  }

  const fileByRel = new Map(filtered.map((t) => [t.path, t]));
  const trashRoot = opts.trashRoot ?? TRASH_DIR;

  const changedForBackup = cls.changed.filter((rel) => {
    const row = fileByRel.get(rel);
    return row && !row.is_dir;
  });
  if (!opts.noBackup && changedForBackup.length > 0) {
    backupToTrash({
      trashRoot,
      projectAlias: project.alias,
      projectRoot,
      files: changedForBackup,
    });
  }

  for (const rel of [...cls.created, ...cls.changed]) {
    const t = fileByRel.get(rel);
    if (!t) continue;
    const abs = safeJoin(projectRoot, rel);
    if (t.is_dir) {
      mkdirSync(abs, { recursive: true });
      try {
        chmodSync(abs, t.mode & 0o7777);
      } catch {
        /* best effort */
      }
    } else {
      const buf = getBlob(db, t.blob_hash);
      if (!buf) throw new Error(`Missing blob ${t.blob_hash} for ${rel}`);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, buf);
      try {
        chmodSync(abs, t.mode & 0o7777);
      } catch {
        /* best effort */
      }
    }
  }

  db.prepare('UPDATE projects SET updated_at = ?, root_path_hint = ? WHERE id = ?').run(
    nowMs(),
    projectRoot,
    project.id,
  );

  return {
    restored: cls.created.length + cls.changed.length,
    created: cls.created,
    changed: cls.changed,
    untrackedKept: cls.untracked,
    dryRun: false,
  };
}

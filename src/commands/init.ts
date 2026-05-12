import { readFileSync } from 'node:fs';
import { putBlob } from '../core/blob.js';
import type { ExpandedFile } from '../core/manifest.js';
import { detectProjectRoot } from '../core/project.js';
import { scanByRules } from '../core/scanner.js';
import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';
import type { ProjectRow, Reporter } from './types.js';

export type InitOptions = {
  cwd: string;
  alias?: string;
  noScan: boolean;
  yes: boolean;
};

export type InitResult = {
  created: boolean;
  linked: boolean;
  project: ProjectRow;
  selected: number;
  saved: number;
};

export async function init(db: Db, opts: InitOptions, reporter: Reporter): Promise<InitResult> {
  const { root, remote } = detectProjectRoot(opts.cwd);

  let alias = opts.alias;
  if (remote) {
    if (!alias) alias = aliasFromRemote(remote);
  } else {
    if (!alias) alias = await reporter.prompt('未检测到 git remote，请输入项目别名', '');
    if (!alias) throw new Error('alias is required when no git remote is found');
  }

  const existing = remote
    ? (db.prepare('SELECT * FROM projects WHERE remote_url = ?').get(remote) as
        | ProjectRow
        | undefined)
    : (db.prepare('SELECT * FROM projects WHERE alias = ?').get(alias) as ProjectRow | undefined);

  if (existing) {
    if (remote) {
      if (!opts.yes) {
        const ok = await reporter.confirm(
          `该 remote 已登记为项目 ${existing.alias}，是否 link 到该项目?`,
        );
        if (!ok) throw new Error('cancelled by user');
      } else {
        reporter.info(`remote 已登记为项目 ${existing.alias}，--yes 自动 link`);
      }
    } else if (!opts.yes) {
      const ok = await reporter.confirm(
        `Project "${existing.alias}" is already registered for this alias. Link cwd to it?`,
      );
      if (!ok) throw new Error('cancelled by user');
    } else {
      reporter.info(`Linked current dir to existing project "${existing.alias}".`);
    }

    const ts = nowMs();
    db.prepare('UPDATE projects SET root_path_hint = ?, updated_at = ? WHERE id = ?').run(
      root,
      ts,
      existing.id,
    );
    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(existing.id) as ProjectRow;
    return { created: false, linked: true, project, selected: 0, saved: 0 };
  }

  const now = nowMs();
  const info = db
    .prepare(
      `INSERT INTO projects (alias, remote_url, root_path_hint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(alias, remote, root, now, now);
  const project = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(info.lastInsertRowid) as ProjectRow;

  let selected: ExpandedFile[] = [];
  if (!opts.noScan) {
    const rules = (
      db.prepare('SELECT pattern FROM global_rules').all() as Array<{ pattern: string }>
    ).map((r) => r.pattern);
    const candidates = scanByRules(root, rules);
    if (candidates.length === 0) {
      reporter.info('No matching files for global rules.');
    } else if (opts.yes) {
      selected = candidates;
    } else {
      const choices = candidates.map((c) => ({
        label: `${c.isDir ? '[dir]' : '     '} ${c.rel}`,
        value: c.rel,
        checked: true,
      }));
      const picked = (await reporter.multiSelect('Select files to manage', choices)) as string[];
      const set = new Set(picked);
      selected = candidates.filter((c) => set.has(c.rel));
    }
  }

  const insertEntry = db.prepare(
    `INSERT OR IGNORE INTO manifest_entries (project_id, path, kind, created_at)
     VALUES (?, ?, 'include', ?)`,
  );
  const tx = db.transaction(() => {
    for (const e of selected) insertEntry.run(project.id, e.rel, now);
  });
  tx();

  let saved = 0;
  if (selected.length > 0) {
    const insertManaged = db.prepare(
      `INSERT INTO managed_files (project_id, path, blob_hash, mode, is_dir, saved_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET blob_hash = excluded.blob_hash,
         mode = excluded.mode, is_dir = excluded.is_dir, saved_at = excluded.saved_at`,
    );
    const saveTx = db.transaction(() => {
      for (const f of selected) {
        const buf = f.isDir ? Buffer.alloc(0) : readFileSync(f.abs);
        const hash = putBlob(db, buf);
        insertManaged.run(project.id, f.rel, hash, f.mode, f.isDir ? 1 : 0, now);
        saved++;
      }
    });
    saveTx();
  }

  return { created: true, linked: false, project, selected: selected.length, saved };
}

function aliasFromRemote(remote: string): string {
  const last = remote.split('/').pop() ?? remote;
  return last.replace(/[^a-z0-9._-]/gi, '-');
}

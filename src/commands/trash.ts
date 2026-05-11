import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { safeJoin } from '../core/paths.js';
import type { Reporter } from './types.js';

export type TrashListEntry = { id: string; alias: string; ts: string; files: string[] };

export type TrashManifest = {
  project_alias: string;
  utc_timestamp: string;
  files: Array<{ path: string }>;
};

export function listTrash(trashRoot: string, filterAlias?: string): TrashListEntry[] {
  if (!existsSync(trashRoot)) return [];
  const out: TrashListEntry[] = [];
  for (const alias of readdirSync(trashRoot)) {
    if (filterAlias && alias !== filterAlias) continue;
    const aliasDir = join(trashRoot, alias);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(aliasDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const ts of readdirSync(aliasDir)) {
      const dir = join(aliasDir, ts);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const manifestPath = join(dir, 'manifest.json');
      let files: string[] = [];
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          files?: Array<{ path: string }>;
        };
        files = (m.files ?? []).map((f) => f.path);
      } catch {
        /* ignore */
      }
      out.push({ id: `${alias}/${ts}`, alias, ts, files });
    }
  }
  out.sort((a, b) => a.alias.localeCompare(b.alias) || a.ts.localeCompare(b.ts));
  return out;
}

export function showTrash(trashRoot: string, id: string): TrashManifest {
  const slash = id.indexOf('/');
  if (slash === -1) throw new Error('Invalid trash id; expected "<alias>/<timestamp>".');
  const alias = id.slice(0, slash);
  const ts = id.slice(slash + 1);
  if (!alias || !ts || ts.includes('/')) {
    throw new Error('Invalid trash id; expected "<alias>/<timestamp>".');
  }
  const manifestPath = join(trashRoot, alias, ts, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Trash entry "${id}" not found.`);
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as TrashManifest;
}

export async function restoreFromTrash(
  trashRoot: string,
  id: string,
  projectRoot: string,
  opts: { yes: boolean },
  reporter: Reporter,
): Promise<{ restored: string[] }> {
  const manifest = showTrash(trashRoot, id);
  const slash = id.indexOf('/');
  const alias = id.slice(0, slash);
  const ts = id.slice(slash + 1);
  const backupRoot = join(trashRoot, alias, ts);
  const restored: string[] = [];
  for (const rel of manifest.files.map((f) => f.path)) {
    const srcAbs = safeJoin(backupRoot, rel);
    const dstAbs = safeJoin(projectRoot, rel);
    if (!existsSync(srcAbs)) continue;
    if (existsSync(dstAbs) && !opts.yes) {
      const ok = await reporter.confirm(`"${rel}" exists locally. Overwrite?`);
      if (!ok) continue;
    }
    mkdirSync(dirname(dstAbs), { recursive: true });
    copyFileSync(srcAbs, dstAbs);
    restored.push(rel);
  }
  return { restored };
}

export async function cleanTrash(
  trashRoot: string,
  opts: { beforeMs: number; yes: boolean },
  reporter: Reporter,
): Promise<number> {
  if (!existsSync(trashRoot)) return 0;
  let removed = 0;
  for (const alias of readdirSync(trashRoot)) {
    const aliasDir = join(trashRoot, alias);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(aliasDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const ts of readdirSync(aliasDir)) {
      const dir = join(aliasDir, ts);
      let mtimeMs: number;
      try {
        mtimeMs = statSync(dir).mtimeMs;
      } catch {
        continue;
      }
      if (mtimeMs >= opts.beforeMs) continue;
      if (!opts.yes) {
        const ok = await reporter.confirm(`Delete trash "${alias}/${ts}"?`);
        if (!ok) continue;
      }
      rmSync(dir, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type TreeEntry = { name: string; rel: string; isDir: boolean };

/** List one level under `relDir` (POSIX rel from project root). Skips `.git`. */
export function listProjectDir(projectRoot: string, relDir: string): TreeEntry[] {
  const abs = join(projectRoot, relDir);
  const names = readdirSync(abs);
  const out: TreeEntry[] = [];
  for (const name of names) {
    if (name === '.git') continue;
    const childRel = relDir ? `${relDir}/${name}` : name;
    try {
      const st = statSync(join(abs, name));
      out.push({ name, rel: childRel, isDir: st.isDirectory() });
    } catch {
      /* broken symlink or race — skip */
    }
  }
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export function parentRel(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? '' : rel.slice(0, i);
}

export type FlatNode = {
  rel: string;
  name: string;
  isDir: boolean;
  depth: number;
  parent: string | null;
};

/** DFS-flatten the project tree according to `expanded` (set of dir rels). */
export function flattenTree(
  projectRoot: string,
  expanded: ReadonlySet<string>,
  startRel = '',
  depth = 0,
): FlatNode[] {
  const out: FlatNode[] = [];
  let entries: TreeEntry[];
  try {
    entries = listProjectDir(projectRoot, startRel);
  } catch {
    return out;
  }
  const parent = startRel || null;
  for (const e of entries) {
    out.push({ rel: e.rel, name: e.name, isDir: e.isDir, depth, parent });
    if (e.isDir && expanded.has(e.rel)) {
      out.push(...flattenTree(projectRoot, expanded, e.rel, depth + 1));
    }
  }
  return out;
}

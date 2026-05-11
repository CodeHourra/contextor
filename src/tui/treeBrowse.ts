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

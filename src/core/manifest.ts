import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import picomatch from 'picomatch';
import type { Db } from '../db/index.js';
import { toRelPosix } from './paths.js';

export type ManifestEntry = { path: string; kind: 'include' | 'exclude' };

export function listManifest(db: Db, projectId: number): ManifestEntry[] {
  return db
    .prepare('SELECT path, kind FROM manifest_entries WHERE project_id = ? ORDER BY path')
    .all(projectId) as ManifestEntry[];
}

function patternToMatcher(pattern: string): (rel: string) => boolean {
  if (pattern.endsWith('/')) {
    const prefix = pattern.replace(/\/+$/, '');
    return (rel) => rel === prefix || rel.startsWith(`${prefix}/`);
  }
  const match = picomatch(pattern, { dot: true });
  return (rel) => match(rel);
}

/**
 * 判断单条 manifest 规则是否在「路径规则」层面命中 rel（不读磁盘）。
 * glob 的 include 对「目录节点本身」返回 false（由 expand 结果补全子路径）。
 */
export function manifestEntryMatchesRelPath(
  rel: string,
  isDir: boolean,
  entry: ManifestEntry,
): boolean {
  const raw = entry.path.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!raw) return false;
  if (entry.kind === 'exclude') {
    return patternToMatcher(raw)(rel);
  }
  const isDirPattern = raw.endsWith('/');
  const cleaned = raw.replace(/\/+$/, '');
  if (isDirPattern) {
    return rel === cleaned || rel.startsWith(`${cleaned}/`);
  }
  if (/[*?[\]]/.test(cleaned)) {
    if (isDir) return false;
    try {
      return picomatch(cleaned, { dot: true })(rel);
    } catch {
      return false;
    }
  }
  return rel === cleaned;
}

export type ExpandedFile = { rel: string; abs: string; isDir: boolean; mode: number; size: number };

export function expandManifest(root: string, entries: ManifestEntry[]): ExpandedFile[] {
  const includes = entries.filter((e) => e.kind === 'include').map((e) => e.path);
  const excludes = entries.filter((e) => e.kind === 'exclude').map((e) => patternToMatcher(e.path));
  const isExcluded = (rel: string) => excludes.some((m) => m(rel));

  const out = new Map<string, ExpandedFile>();
  for (const inc of includes) {
    walkInclude(root, inc, isExcluded, out);
  }
  return Array.from(out.values()).sort((a, b) => a.rel.localeCompare(b.rel));
}

function walkInclude(
  root: string,
  pattern: string,
  isExcluded: (rel: string) => boolean,
  out: Map<string, ExpandedFile>,
): void {
  // pattern 可能是: 具体相对路径 / 目录(尾随 /) / glob
  const isDirPattern = pattern.endsWith('/');
  const cleaned = pattern.replace(/\/+$/, '');

  const tryStat = (rel: string) => {
    try {
      const abs = join(root, rel);
      const s = statSync(abs);
      if (s.isDirectory()) {
        addDirEntry(rel, abs, s.mode, isExcluded, out);
        walkDir(root, rel, isExcluded, out);
      } else if (s.isFile()) {
        if (isExcluded(rel)) return;
        out.set(rel, { rel, abs, isDir: false, mode: s.mode, size: s.size });
      }
    } catch {
      /* missing entry — skip */
    }
  };

  if (isDirPattern) {
    tryStat(cleaned);
    return;
  }
  // glob 或具体文件
  if (/[*?[\]]/.test(cleaned)) {
    walkGlob(root, cleaned, isExcluded, out);
  } else {
    tryStat(cleaned);
  }
}

function walkDir(
  root: string,
  relDir: string,
  isExcluded: (rel: string) => boolean,
  out: Map<string, ExpandedFile>,
): void {
  const abs = join(root, relDir);
  let names: string[];
  try {
    names = readdirSync(abs);
  } catch {
    return;
  }
  for (const name of names) {
    const childRel = relDir ? `${relDir}/${name}` : name;
    if (childRel === '.git' || childRel.startsWith('.git/')) continue;
    if (isExcluded(childRel)) continue;
    const childAbs = join(abs, name);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(childAbs);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      addDirEntry(childRel, childAbs, s.mode, isExcluded, out);
      walkDir(root, childRel, isExcluded, out);
    } else if (s.isFile()) {
      out.set(childRel, { rel: childRel, abs: childAbs, isDir: false, mode: s.mode, size: s.size });
    }
  }
}

function addDirEntry(
  rel: string,
  abs: string,
  mode: number,
  isExcluded: (rel: string) => boolean,
  out: Map<string, ExpandedFile>,
): void {
  if (isExcluded(rel)) return;
  out.set(rel, { rel, abs, isDir: true, mode, size: 0 });
}

function walkGlob(
  root: string,
  pattern: string,
  isExcluded: (rel: string) => boolean,
  out: Map<string, ExpandedFile>,
): void {
  const match = picomatch(pattern, { dot: true });
  const stack: string[] = [''];
  while (stack.length) {
    const relDir = stack.pop() as string;
    let names: string[];
    try {
      names = readdirSync(join(root, relDir) || root);
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = relDir ? `${relDir}/${name}` : name;
      if (rel === '.git' || rel.startsWith('.git/')) continue;
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(join(root, rel));
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        stack.push(rel);
        continue;
      }
      if (match(rel) && !isExcluded(rel)) {
        out.set(rel, { rel, abs: join(root, rel), isDir: false, mode: s.mode, size: s.size });
      }
    }
  }
}

// 还需要顺手用
export { toRelPosix };

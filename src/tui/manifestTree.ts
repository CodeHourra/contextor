import type { ManifestEntry } from '../core/manifest.js';

export type ManifestRelMeta = {
  rel: string;
  /** 显式 manifest 行声明为目录（尾随 /） */
  explicitDir: boolean;
  include: boolean;
  exclude: boolean;
};

export type ManifestTreeIndex = {
  /** 所有出现在树中的 rel（含为子路径补上的父目录） */
  allRels: ReadonlySet<string>;
  meta(rel: string): ManifestRelMeta;
  /** 直接子节点 rel 列表，已排序：目录优先，再按路径名 */
  children(parent: string): string[];
};

function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function parentRel(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? '' : rel.slice(0, i);
}

function isDirRel(
  rel: string,
  all: ReadonlySet<string>,
  meta: Map<string, ManifestRelMeta>,
): boolean {
  const m = meta.get(rel);
  if (m?.explicitDir) return true;
  const prefix = `${rel}/`;
  for (const r of all) {
    if (r !== rel && r.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * 由 manifest 原始条目构建虚拟目录树（不读磁盘）。
 * 父目录可为「仅为容纳子路径」而存在的隐式目录。
 */
export function buildManifestTreeIndex(entries: ManifestEntry[]): ManifestTreeIndex {
  const meta = new Map<string, ManifestRelMeta>();

  function touch(
    rel: string,
    patch: Partial<Pick<ManifestRelMeta, 'explicitDir' | 'include' | 'exclude'>>,
  ) {
    let m = meta.get(rel);
    if (!m) {
      m = { rel, explicitDir: false, include: false, exclude: false };
      meta.set(rel, m);
    }
    if (patch.explicitDir) m.explicitDir = true;
    if (patch.include) m.include = true;
    if (patch.exclude) m.exclude = true;
  }

  for (const e of entries) {
    const raw = normPath(e.path);
    if (!raw) continue;
    const isManifestDir = raw.endsWith('/');
    const relPath = raw.replace(/\/+$/, '');
    if (!relPath) continue;
    const segments = relPath.split('/').filter(Boolean);
    for (let i = 0; i < segments.length - 1; i++) {
      const dirRel = segments.slice(0, i + 1).join('/');
      touch(dirRel, {});
    }
    if (isManifestDir) {
      touch(relPath, {
        explicitDir: true,
        include: e.kind === 'include',
        exclude: e.kind === 'exclude',
      });
    } else {
      touch(relPath, {
        include: e.kind === 'include',
        exclude: e.kind === 'exclude',
      });
    }
  }

  const allRels = new Set(meta.keys());
  for (const rel of [...allRels]) {
    let p = parentRel(rel);
    while (p) {
      if (!meta.has(p)) {
        meta.set(p, { rel: p, explicitDir: false, include: false, exclude: false });
        allRels.add(p);
      }
      p = parentRel(p);
    }
  }

  const frozen = new Set(allRels);

  function cmp(a: string, b: string): number {
    const da = isDirRel(a, frozen, meta);
    const db = isDirRel(b, frozen, meta);
    if (da !== db) return da ? -1 : 1;
    return a.localeCompare(b);
  }

  const childrenCache = new Map<string, string[]>();

  function children(parent: string): string[] {
    const hit = childrenCache.get(parent);
    if (hit) return hit;
    const pref = parent ? `${parent}/` : '';
    const direct = new Set<string>();
    for (const rel of frozen) {
      if (rel === parent) continue;
      if (!rel.startsWith(pref)) continue;
      const rest = pref ? rel.slice(pref.length) : rel;
      const seg = rest.split('/')[0];
      if (!seg) continue;
      const child = parent ? `${parent}/${seg}` : seg;
      if (rest === seg || rest.startsWith(`${seg}/`)) direct.add(child);
    }
    const arr = [...direct].sort(cmp);
    childrenCache.set(parent, arr);
    return arr;
  }

  return {
    allRels: frozen,
    meta(rel: string) {
      const m = meta.get(rel);
      if (!m) {
        return {
          rel,
          explicitDir: false,
          include: false,
          exclude: false,
        };
      }
      return { rel: m.rel, explicitDir: m.explicitDir, include: m.include, exclude: m.exclude };
    },
    children,
  };
}

/** 合并 meta 与派生的 isDir，供 UI 使用 */
export function manifestRowIsDir(rel: string, index: ManifestTreeIndex): boolean {
  const m = index.meta(rel);
  if (m.explicitDir) return true;
  const prefix = `${rel}/`;
  for (const r of index.allRels) {
    if (r !== rel && r.startsWith(prefix)) return true;
  }
  return false;
}

export type ManifestFlatRow = {
  rel: string;
  name: string;
  isDir: boolean;
  depth: number;
  parent: string | null;
  include: boolean;
  exclude: boolean;
};

export function flattenManifestTree(
  index: ManifestTreeIndex,
  expanded: ReadonlySet<string>,
  parent = '',
  depth = 0,
): ManifestFlatRow[] {
  const out: ManifestFlatRow[] = [];
  const kids = index.children(parent);
  const parentDisplay = parent || null;
  for (const rel of kids) {
    const m = index.meta(rel);
    const isDir = manifestRowIsDir(rel, index);
    const name = rel.includes('/') ? rel.slice(rel.lastIndexOf('/') + 1) : rel;
    out.push({
      rel,
      name,
      isDir,
      depth,
      parent: parentDisplay,
      include: m.include,
      exclude: m.exclude,
    });
    if (isDir && expanded.has(rel)) {
      out.push(...flattenManifestTree(index, expanded, rel, depth + 1));
    }
  }
  return out;
}

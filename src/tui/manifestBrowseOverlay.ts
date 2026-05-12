import type { ManifestEntry } from '../core/manifest.js';
import { expandManifest, manifestEntryMatchesRelPath } from '../core/manifest.js';
import type { FlatNode } from './treeBrowse.js';

/** expandManifest 产出的所有 rel（含目录占位），用于补全 glob include 对目录行的展示 */
export function buildExpandedManifestRelSet(
  projectRoot: string,
  entries: ManifestEntry[],
): ReadonlySet<string> {
  try {
    return new Set(expandManifest(projectRoot, entries).map((e) => e.rel));
  } catch {
    return new Set<string>();
  }
}

/**
 * add/rm 浏览树行上的「已在 manifest / 快照展开域」提示。
 * exclude 与 include 同时成立时两者都 true（UI 可标为 !#）。
 */
export function manifestBrowseRowOverlay(
  n: FlatNode,
  entries: ManifestEntry[],
  expandedRels: ReadonlySet<string>,
): { include: boolean; exclude: boolean } {
  let include = false;
  let exclude = false;
  for (const e of entries) {
    if (manifestEntryMatchesRelPath(n.rel, n.isDir, e)) {
      if (e.kind === 'include') include = true;
      else exclude = true;
    }
  }
  if (expandedRels.has(n.rel)) include = true;
  if (n.isDir) {
    for (const r of expandedRels) {
      if (r !== n.rel && r.startsWith(`${n.rel}/`)) {
        include = true;
        break;
      }
    }
  }
  return { include, exclude };
}

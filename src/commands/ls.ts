import { type ManifestEntry, listManifest } from '../core/manifest.js';
import type { Db } from '../db/index.js';

/**
 * 列出项目的 manifest 条目（include + exclude），按 path 升序。
 *
 * 这是 manifest CRUD 中的 read 端：返回原始 manifest_entries，不展开 glob、
 * 不查 managed_files。展开后的 saved 视图属于 `status` 命令的范畴。
 */
export async function ls(db: Db, projectId: number): Promise<ManifestEntry[]> {
  return listManifest(db, projectId);
}

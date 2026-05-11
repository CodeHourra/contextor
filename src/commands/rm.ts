import type { Db } from '../db/index.js';

export type RmResult = {
  /** 删除的 manifest_entries 行数（同一 path 的 include/exclude 都计入） */
  removed: number;
};

/**
 * 从项目 manifest 中删除指定 path 的条目（include/exclude 都删）。
 *
 * v1 不级联：已 saved 的 managed_files 行被刻意保留，
 * 用户需要显式 `save` / `restore` 流程或后续 GC 才会改变它们。
 * 这样允许用户「先 rm 再 save」时回收内容，也允许用户调整 manifest
 * 而不立即丢失历史快照。
 */
export async function rm(db: Db, projectId: number, paths: string[]): Promise<RmResult> {
  const stmt = db.prepare('DELETE FROM manifest_entries WHERE project_id = ? AND path = ?');
  let removed = 0;
  const tx = db.transaction(() => {
    for (const p of paths) {
      const norm = normalizeForDelete(p);
      const r = stmt.run(projectId, norm);
      removed += r.changes;
    }
  });
  tx();
  return { removed };
}

function normalizeForDelete(p: string): string {
  if (!p || !p.trim()) {
    throw new Error('Empty path is not allowed');
  }
  return p.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

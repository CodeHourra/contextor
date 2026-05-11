import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';

export type AddOptions = {
  exclude: boolean;
};

export type AddResult = {
  /** 实际新增的 path（已存在的同 (project, path, kind) 因 unique 约束被跳过，不出现在此列表） */
  added: string[];
};

/**
 * 向项目 manifest 追加 include 或 exclude 条目。
 *
 * 路径策略：调用方负责传入项目相对的 POSIX 路径。本函数只做最小归一：
 *   - 反斜杠 → 正斜杠
 *   - 去掉前导 `./`
 *   - 拒绝绝对路径与含 `..` 段的路径（避免越狱与异常数据写入）
 *
 * 去重：依赖 manifest_entries 上的 UNIQUE(project_id, path, kind)，
 * 重复 add 等价幂等（不报错，不计入 added）。
 */
export async function add(
  db: Db,
  projectId: number,
  paths: string[],
  opts: AddOptions,
): Promise<AddResult> {
  const kind = opts.exclude ? 'exclude' : 'include';
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO manifest_entries (project_id, path, kind, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  const now = nowMs();
  const added: string[] = [];
  const tx = db.transaction(() => {
    for (const raw of paths) {
      const norm = normalizeProjectRelPath(raw);
      const r = stmt.run(projectId, norm, kind, now);
      if (r.changes > 0) added.push(norm);
    }
  });
  tx();
  return { added };
}

function normalizeProjectRelPath(p: string): string {
  if (!p || !p.trim()) {
    throw new Error('Empty path is not allowed in manifest entry');
  }
  const cleaned = p.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (cleaned.startsWith('/')) {
    throw new Error(`Absolute path is not allowed in manifest entry: "${p}"`);
  }
  const segs = cleaned.split('/');
  if (segs.some((s) => s === '..')) {
    throw new Error(`Path escapes project root: "${p}"`);
  }
  return cleaned;
}

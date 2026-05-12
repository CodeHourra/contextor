import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';

/**
 * 重命名项目 alias。
 *
 * 失败语义：
 *   - oldAlias 不存在 → 抛 "not found"
 *   - newAlias 已被占用 → 抛 "already exists"（先于 UPDATE 检查，避免依赖 UNIQUE
 *     约束抛出的低层 SqliteError 文案）
 */
export async function rename(db: Db, oldAlias: string, newAlias: string): Promise<void> {
  if (oldAlias === newAlias) return;

  const exists = db.prepare('SELECT id FROM projects WHERE alias = ?').get(oldAlias) as
    | { id: number }
    | undefined;
  if (!exists) {
    throw new Error(`Project "${oldAlias}" not found.`);
  }

  const conflict = db.prepare('SELECT id FROM projects WHERE alias = ?').get(newAlias) as
    | { id: number }
    | undefined;
  if (conflict) {
    throw new Error(`Project alias "${newAlias}" already exists.`);
  }

  db.prepare('UPDATE projects SET alias = ?, updated_at = ? WHERE id = ?').run(
    newAlias,
    nowMs(),
    exists.id,
  );
}

import { detectProjectRoot } from '../core/project.js';
import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';
import type { ProjectRow } from './types.js';

/**
 * 把 cwd（实际写入的是 detectProjectRoot 解析出的 git 根，无 git 时退化到 cwd）
 * 作为 root_path_hint 绑定到指定 alias 的项目。
 *
 * 这里写「根」而非「原始 cwd」是为了和 init/save 中的 lookup 语义一致：
 * lookupProjectByCwd 会从 cwd 反推 git 根去匹配 root_path_hint，所以 hint
 * 必须存的是同一种归一化结果。
 */
export async function link(db: Db, alias: string, cwd: string): Promise<ProjectRow> {
  const proj = db.prepare('SELECT * FROM projects WHERE alias = ?').get(alias) as
    | ProjectRow
    | undefined;
  if (!proj) {
    throw new Error(`Project "${alias}" not found.`);
  }
  const { root } = detectProjectRoot(cwd);
  const ts = nowMs();
  db.prepare('UPDATE projects SET root_path_hint = ?, updated_at = ? WHERE id = ?').run(
    root,
    ts,
    proj.id,
  );
  return { ...proj, root_path_hint: root, updated_at: ts };
}

import type { Db } from '../db/index.js';
import type { Reporter } from './types.js';

export type RemoveOptions = {
  yes: boolean;
};

export type RemoveResult = {
  removed: boolean;
  alias: string;
};

/**
 * 删除项目记录，依赖 projects → manifest_entries / managed_files 的
 * ON DELETE CASCADE 一并清理。
 *
 * 注意：
 *   - file_blobs 是内容寻址表，不级联删；本命令仅提示用户运行 GC，
 *     是否真正回收孤儿 blob 由用户主动选择（避免删除项目时偷偷重 IO）。
 *   - --yes 跳过 confirm；其余情况使用中文 confirm 文案。
 *   - 用户答 N 时返回 { removed: false }，不抛错。
 */
export async function remove(
  db: Db,
  alias: string,
  opts: RemoveOptions,
  reporter: Reporter,
): Promise<RemoveResult> {
  const proj = db.prepare('SELECT id FROM projects WHERE alias = ?').get(alias) as
    | { id: number }
    | undefined;
  if (!proj) {
    throw new Error(`Project "${alias}" not found.`);
  }

  if (!opts.yes) {
    const ok = await reporter.confirm(`删除项目 ${alias} 及其全部数据? (y/N)`);
    if (!ok) {
      reporter.info(`已取消删除 "${alias}".`);
      return { removed: false, alias };
    }
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(proj.id);

  reporter.success(`已删除项目 "${alias}"（manifest / managed_files 已级联清除）。`);
  reporter.info('提示：可运行 `contextor gc` 回收孤儿 blob 释放磁盘空间。');

  return { removed: true, alias };
}

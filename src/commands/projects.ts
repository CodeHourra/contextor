import type { Db } from '../db/index.js';

export type ProjectSummary = {
  id: number;
  alias: string;
  remote_url: string | null;
  fileCount: number;
  /** 该项目最近一次 `save` 时间（epoch ms）；从未保存为 null */
  lastSavedAt: number | null;
};

/**
 * 列出所有项目的摘要，按 updated_at 降序。
 *
 * fileCount 只统计文件（is_dir = 0），不算目录占位行；lastSavedAt 取
 * managed_files.saved_at 的 MAX，未保存项目为 null。
 */
export async function projects(db: Db): Promise<ProjectSummary[]> {
  const rows = db
    .prepare(
      `SELECT
         p.id            AS id,
         p.alias         AS alias,
         p.remote_url    AS remote_url,
         (SELECT COUNT(*) FROM managed_files
            WHERE project_id = p.id AND is_dir = 0) AS fileCount,
         (SELECT MAX(saved_at) FROM managed_files
            WHERE project_id = p.id)               AS lastSavedAt
       FROM projects p
       ORDER BY p.updated_at DESC`,
    )
    .all() as Array<{
    id: number;
    alias: string;
    remote_url: string | null;
    fileCount: number;
    lastSavedAt: number | null;
  }>;
  return rows;
}

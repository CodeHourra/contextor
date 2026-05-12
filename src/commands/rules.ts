import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';

export type Rule = { id: number; pattern: string; isDefault: boolean };

export function listRules(db: Db): Rule[] {
  const rows = db
    .prepare('SELECT id, pattern, is_default FROM global_rules ORDER BY pattern')
    .all() as Array<{ id: number; pattern: string; is_default: number }>;
  return rows.map((r) => ({ id: r.id, pattern: r.pattern, isDefault: r.is_default === 1 }));
}

export function addRule(db: Db, pattern: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO global_rules (pattern, is_default, created_at) VALUES (?, 0, ?)',
  ).run(pattern, nowMs());
}

export function rmRule(db: Db, pattern: string): void {
  const row = db.prepare('SELECT is_default FROM global_rules WHERE pattern = ?').get(pattern) as
    | { is_default: number }
    | undefined;
  if (!row) throw new Error(`Rule "${pattern}" not found.`);
  if (row.is_default === 1) {
    throw new Error('Cannot remove a default rule. Use per-project `add --exclude` to override.');
  }
  db.prepare('DELETE FROM global_rules WHERE pattern = ?').run(pattern);
}

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../../src/db/index.js';

describe('openDb', () => {
  let tmp: string;
  let dbPath: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-test-'));
    dbPath = join(tmp, 'test.db');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('creates schema and seeds default rules', () => {
    const db = openDb(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
      name: string;
    }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'projects',
        'file_blobs',
        'managed_files',
        'manifest_entries',
        'global_rules',
        'meta',
      ]),
    );

    const rules = db
      .prepare('SELECT pattern FROM global_rules WHERE is_default = 1 ORDER BY pattern')
      .all() as Array<{ pattern: string }>;
    expect(rules.map((r) => r.pattern)).toEqual([
      '.claude/',
      '.codebuddy/',
      '.codex/',
      '.cursor/',
      '.env*',
      '.gemini/',
      '.vscode/',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    db.close();
  });

  it('is idempotent on second open', () => {
    openDb(dbPath).close();
    const db = openDb(dbPath);
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM global_rules WHERE is_default = 1')
      .get() as { n: number };
    expect(count.n).toBe(9);
    db.close();
  });
});

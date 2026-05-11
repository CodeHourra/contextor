import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/commands/init.js';
import { save } from '../../src/commands/save.js';
import { openDb } from '../../src/db/index.js';
import { mockReporter } from '../helpers/reporter.js';

const ELEVEN_MB = 11 * 1024 * 1024;

describe('save (integration)', () => {
  let proj: string;
  let dbRoot: string;
  let dbPath: string;

  beforeEach(() => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-save-db-'));
    dbPath = join(dbRoot, 't.db');
    proj = mkdtempSync(join(tmpdir(), 'ctx-save-proj-'));
    mkdirSync(join(proj, '.cursor'), { recursive: true });
    writeFileSync(join(proj, '.cursor', 'rules.md'), 'rules', 'utf8');
    writeFileSync(join(proj, '.env'), 'A=1', 'utf8');
  });

  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    rmSync(dbRoot, { recursive: true, force: true });
  });

  it('first save persists manifest files with added > 0', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'save-p1', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.cursor/rules.md', ts);

    const r = await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    expect(r.added).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.removed).toBe(0);
    expect(r.skippedLarge).toBe(0);

    const rows = db
      .prepare('SELECT path FROM managed_files WHERE project_id = ? ORDER BY path')
      .all(project.id) as Array<{ path: string }>;
    expect(rows.map((x) => x.path)).toEqual(['.cursor/rules.md', '.env']);
    db.close();
  });

  it('second save with no edits returns all zeros', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'save-p2', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    for (const p of ['.env', '.cursor/rules.md']) {
      db.prepare(
        `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
      ).run(project.id, p, ts);
    }
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    const r2 = await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    expect(r2).toEqual({ added: 0, updated: 0, removed: 0, skippedLarge: 0 });
    db.close();
  });

  it('content change increments updated', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'save-p3', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);

    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    writeFileSync(join(proj, '.env'), 'A=2', 'utf8');
    const r = await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    expect(r).toEqual({ added: 0, updated: 1, removed: 0, skippedLarge: 0 });
    db.close();
  });

  it('large file: warn + skip without --allow-large; include with --allow-large', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'save-p4', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, 'big.bin', ts);
    writeFileSync(join(proj, 'big.bin'), Buffer.alloc(ELEVEN_MB));

    const warn = vi.fn();
    const reporter = { ...mockReporter(), warn };
    const r1 = await save(db, { cwd: proj, allowLarge: false, dryRun: false }, reporter);
    expect(r1).toEqual({ added: 0, updated: 0, removed: 0, skippedLarge: 1 });
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/skip|large|10|MB/i);

    const n0 = db
      .prepare('SELECT COUNT(*) AS n FROM managed_files WHERE project_id = ? AND path = ?')
      .get(project.id, 'big.bin') as { n: number };
    expect(n0.n).toBe(0);

    const r2 = await save(db, { cwd: proj, allowLarge: true, dryRun: false }, mockReporter());
    expect(r2.added).toBe(1);
    expect(r2.updated).toBe(0);
    expect(r2.removed).toBe(0);
    expect(r2.skippedLarge).toBe(0);

    const n1 = db
      .prepare('SELECT COUNT(*) AS n FROM managed_files WHERE project_id = ? AND path = ?')
      .get(project.id, 'big.bin') as { n: number };
    expect(n1.n).toBe(1);
    db.close();
  });
});

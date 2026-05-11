import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { add } from '../../src/commands/add.js';
import { init } from '../../src/commands/init.js';
import { link } from '../../src/commands/link.js';
import { projects } from '../../src/commands/projects.js';
import { remove } from '../../src/commands/remove.js';
import { rename } from '../../src/commands/rename.js';
import { save } from '../../src/commands/save.js';
import { openDb } from '../../src/db/index.js';
import { mockReporter } from '../helpers/reporter.js';

describe('project mgmt (projects / link / rename / remove)', () => {
  let projA: string;
  let projB: string;
  let dbRoot: string;
  let dbPath: string;

  beforeEach(() => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-pm-db-'));
    dbPath = join(dbRoot, 't.db');
    projA = mkdtempSync(join(tmpdir(), 'ctx-pm-a-'));
    projB = mkdtempSync(join(tmpdir(), 'ctx-pm-b-'));
    mkdirSync(join(projA, '.cursor'), { recursive: true });
    writeFileSync(join(projA, '.cursor', 'rules.md'), 'rules', 'utf8');
    writeFileSync(join(projA, '.env'), 'A=1', 'utf8');
    writeFileSync(join(projB, '.env'), 'B=1', 'utf8');
  });

  afterEach(() => {
    rmSync(projA, { recursive: true, force: true });
    rmSync(projB, { recursive: true, force: true });
    rmSync(dbRoot, { recursive: true, force: true });
  });

  it('projects 返回所有项目摘要：fileCount / lastSavedAt 反映 save 状态', async () => {
    const db = openDb(dbPath);

    const { project: pa } = await init(
      db,
      { cwd: projA, alias: 'alpha', noScan: true, yes: true },
      mockReporter(),
    );
    await init(db, { cwd: projB, alias: 'beta', noScan: true, yes: true }, mockReporter());

    await add(db, pa.id, ['.env', '.cursor/rules.md'], { exclude: false });
    const before = Date.now();
    await save(db, { cwd: projA, allowLarge: false, dryRun: false }, mockReporter());
    const after = Date.now();

    const list = await projects(db);
    const byAlias = Object.fromEntries(list.map((p) => [p.alias, p]));

    expect(Object.keys(byAlias).sort()).toEqual(['alpha', 'beta']);

    expect(byAlias.alpha?.fileCount).toBe(2);
    expect(byAlias.alpha?.lastSavedAt).not.toBeNull();
    const ts = byAlias.alpha?.lastSavedAt as number;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);

    expect(byAlias.beta?.fileCount).toBe(0);
    expect(byAlias.beta?.lastSavedAt).toBeNull();

    db.close();
  });

  it('link 更新 alias 项目的 root_path_hint 为 cwd 的 git 根（无 git 时退化为 cwd）', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: projA, alias: 'alpha', noScan: true, yes: true }, mockReporter());

    const newRoot = mkdtempSync(join(tmpdir(), 'ctx-pm-relink-'));
    try {
      const updated = await link(db, 'alpha', newRoot);
      expect(updated.alias).toBe('alpha');
      expect(updated.root_path_hint).toBe(newRoot);

      const row = db.prepare('SELECT root_path_hint FROM projects WHERE alias = ?').get('alpha') as
        | { root_path_hint: string }
        | undefined;
      expect(row?.root_path_hint).toBe(newRoot);
    } finally {
      rmSync(newRoot, { recursive: true, force: true });
    }

    await expect(link(db, 'no-such', projA)).rejects.toThrow(/not found/);
    db.close();
  });

  it('rename 成功改 alias，冲突或缺失时抛错', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: projA, alias: 'alpha', noScan: true, yes: true }, mockReporter());
    await init(db, { cwd: projB, alias: 'beta', noScan: true, yes: true }, mockReporter());

    await rename(db, 'alpha', 'gamma');
    const aliases = (
      db.prepare('SELECT alias FROM projects ORDER BY alias').all() as Array<{ alias: string }>
    ).map((r) => r.alias);
    expect(aliases).toEqual(['beta', 'gamma']);

    await expect(rename(db, 'gamma', 'beta')).rejects.toThrow(/already exists/);
    await expect(rename(db, 'no-such', 'whatever')).rejects.toThrow(/not found/);

    const aliases2 = (
      db.prepare('SELECT alias FROM projects ORDER BY alias').all() as Array<{ alias: string }>
    ).map((r) => r.alias);
    expect(aliases2).toEqual(['beta', 'gamma']);

    db.close();
  });

  it('remove --yes 跳过 confirm，CASCADE 清掉 manifest_entries / managed_files', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: projA, alias: 'alpha', noScan: true, yes: true },
      mockReporter(),
    );
    await add(db, project.id, ['.env'], { exclude: false });
    await save(db, { cwd: projA, allowLarge: false, dryRun: false }, mockReporter());

    expect(
      (
        db
          .prepare('SELECT COUNT(*) AS n FROM manifest_entries WHERE project_id = ?')
          .get(project.id) as { n: number }
      ).n,
    ).toBeGreaterThan(0);
    expect(
      (
        db
          .prepare('SELECT COUNT(*) AS n FROM managed_files WHERE project_id = ?')
          .get(project.id) as { n: number }
      ).n,
    ).toBeGreaterThan(0);

    const confirmSpy = vi.fn((_prompt: string) => Promise.resolve(true));
    const reporter = { ...mockReporter(), confirm: confirmSpy };
    const r = await remove(db, 'alpha', { yes: true }, reporter);
    expect(r).toEqual({ removed: true, alias: 'alpha' });
    expect(confirmSpy).not.toHaveBeenCalled();

    const left = await projects(db);
    expect(left.find((p) => p.alias === 'alpha')).toBeUndefined();

    expect(
      (
        db
          .prepare('SELECT COUNT(*) AS n FROM manifest_entries WHERE project_id = ?')
          .get(project.id) as { n: number }
      ).n,
    ).toBe(0);
    expect(
      (
        db
          .prepare('SELECT COUNT(*) AS n FROM managed_files WHERE project_id = ?')
          .get(project.id) as { n: number }
      ).n,
    ).toBe(0);

    db.close();
  });

  it('remove 默认 confirm 用中文文案；用户答 N 时不删除', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: projA, alias: 'alpha', noScan: true, yes: true }, mockReporter());

    const confirmSpy = vi.fn((_prompt: string) => Promise.resolve(false));
    const info = vi.fn();
    const reporter = { ...mockReporter(), confirm: confirmSpy, info };
    const r = await remove(db, 'alpha', { yes: false }, reporter);

    expect(r).toEqual({ removed: false, alias: 'alpha' });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(String(confirmSpy.mock.calls[0]?.[0])).toMatch(/删除项目 alpha 及其全部数据\?/);
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/已取消删除/));

    const stillThere = (
      db.prepare('SELECT COUNT(*) AS n FROM projects WHERE alias = ?').get('alpha') as { n: number }
    ).n;
    expect(stillThere).toBe(1);

    await expect(remove(db, 'no-such', { yes: true }, mockReporter())).rejects.toThrow(/not found/);

    db.close();
  });
});

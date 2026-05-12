import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { add } from '../../src/commands/add.js';
import { init } from '../../src/commands/init.js';
import { ls } from '../../src/commands/ls.js';
import { rm } from '../../src/commands/rm.js';
import { openDb } from '../../src/db/index.js';
import { mockReporter } from '../helpers/reporter.js';

describe('manifest CRUD (add / rm / ls)', () => {
  let proj: string;
  let dbRoot: string;
  let dbPath: string;

  beforeEach(() => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-mfc-db-'));
    dbPath = join(dbRoot, 't.db');
    proj = mkdtempSync(join(tmpdir(), 'ctx-mfc-proj-'));
    mkdirSync(join(proj, '.cursor'), { recursive: true });
    writeFileSync(join(proj, '.cursor', 'rules.md'), 'rules', 'utf8');
    writeFileSync(join(proj, '.env'), 'A=1', 'utf8');
    writeFileSync(join(proj, 'AGENTS.md'), '# a', 'utf8');
  });

  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    rmSync(dbRoot, { recursive: true, force: true });
  });

  async function bootstrap() {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'mfc', noScan: true, yes: true },
      mockReporter(),
    );
    return { db, projectId: project.id };
  }

  it('add 写入 include 条目并返回新增 paths', async () => {
    const { db, projectId } = await bootstrap();

    const r = await add(db, projectId, ['AGENTS.md', '.cursor/rules.md'], { exclude: false });
    expect(r.added.sort()).toEqual(['.cursor/rules.md', 'AGENTS.md']);

    const rows = db
      .prepare('SELECT path, kind FROM manifest_entries WHERE project_id = ? ORDER BY path')
      .all(projectId) as Array<{ path: string; kind: string }>;
    expect(rows).toEqual([
      { path: '.cursor/rules.md', kind: 'include' },
      { path: 'AGENTS.md', kind: 'include' },
    ]);
    db.close();
  });

  it('add 重复幂等：相同 (project, path, kind) 第二次 add 不改库且 added=[]', async () => {
    const { db, projectId } = await bootstrap();

    const first = await add(db, projectId, ['AGENTS.md'], { exclude: false });
    expect(first.added).toEqual(['AGENTS.md']);

    const second = await add(db, projectId, ['AGENTS.md'], { exclude: false });
    expect(second.added).toEqual([]);

    const cnt = db
      .prepare(
        "SELECT COUNT(*) AS n FROM manifest_entries WHERE project_id = ? AND path = ? AND kind = 'include'",
      )
      .get(projectId, 'AGENTS.md') as { n: number };
    expect(cnt.n).toBe(1);
    db.close();
  });

  it('add --exclude 与 add 同 path 共存（kind 不同视为不同条目）', async () => {
    const { db, projectId } = await bootstrap();

    const inc = await add(db, projectId, ['.cursor/'], { exclude: false });
    const exc = await add(db, projectId, ['.cursor/'], { exclude: true });
    expect(inc.added).toEqual(['.cursor/']);
    expect(exc.added).toEqual(['.cursor/']);

    const rows = db
      .prepare('SELECT path, kind FROM manifest_entries WHERE project_id = ? ORDER BY kind')
      .all(projectId) as Array<{ path: string; kind: string }>;
    expect(rows).toEqual([
      { path: '.cursor/', kind: 'exclude' },
      { path: '.cursor/', kind: 'include' },
    ]);
    db.close();
  });

  it('rm 按 path 删除所有 kind 的行；不级联删除 managed_files', async () => {
    const { db, projectId } = await bootstrap();

    await add(db, projectId, ['.env'], { exclude: false });
    await add(db, projectId, ['.env'], { exclude: true });

    const ts = Date.now();
    const blobHash = 'abc123-not-real';
    db.prepare(
      `INSERT INTO file_blobs (hash, content, size, encryption_method, created_at)
       VALUES (?, ?, ?, 'none', ?)`,
    ).run(blobHash, Buffer.from('A=1'), 3, ts);
    db.prepare(
      `INSERT INTO managed_files (project_id, path, blob_hash, mode, is_dir, saved_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    ).run(projectId, '.env', blobHash, 0o644, ts);

    const r = await rm(db, projectId, ['.env']);
    expect(r.removed).toBe(2);

    const remainEntries = db
      .prepare('SELECT COUNT(*) AS n FROM manifest_entries WHERE project_id = ?')
      .get(projectId) as { n: number };
    expect(remainEntries.n).toBe(0);

    const remainManaged = db
      .prepare('SELECT COUNT(*) AS n FROM managed_files WHERE project_id = ? AND path = ?')
      .get(projectId, '.env') as { n: number };
    expect(remainManaged.n).toBe(1);
    db.close();
  });

  it('ls 返回 ManifestEntry[]，按 path 升序', async () => {
    const { db, projectId } = await bootstrap();

    await add(db, projectId, ['z.txt', 'a.txt', 'm.txt'], { exclude: false });
    await add(db, projectId, ['m.txt'], { exclude: true });

    const list = await ls(db, projectId);
    expect(list).toEqual([
      { path: 'a.txt', kind: 'include' },
      { path: 'm.txt', kind: 'exclude' },
      { path: 'm.txt', kind: 'include' },
      { path: 'z.txt', kind: 'include' },
    ]);
    db.close();
  });

  it('rm 不存在的 path：不报错，removed=0', async () => {
    const { db, projectId } = await bootstrap();
    const r = await rm(db, projectId, ['nope.txt']);
    expect(r.removed).toBe(0);
    db.close();
  });

  it('add 拒绝绝对路径与 .. 越狱', async () => {
    const { db, projectId } = await bootstrap();
    await expect(add(db, projectId, ['/etc/passwd'], { exclude: false })).rejects.toThrow(
      /Absolute path/,
    );
    await expect(add(db, projectId, ['../escape'], { exclude: false })).rejects.toThrow(/escape/);
    db.close();
  });
});

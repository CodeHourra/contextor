import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/commands/init.js';
import { normalizeRemoteUrl } from '../../src/core/project.js';
import { openDb } from '../../src/db/index.js';
import { nowMs } from '../../src/utils/time.js';
import { mockReporter } from '../helpers/reporter.js';

function gitInit(cwd: string, originUrl?: string): void {
  execSync('git init', { cwd, stdio: 'ignore' });
  execSync('git config user.email "ctx-test@example.com"', { cwd, stdio: 'ignore' });
  execSync('git config user.name "ctx-test"', { cwd, stdio: 'ignore' });
  if (originUrl) {
    execSync(`git remote add origin ${originUrl}`, { cwd, stdio: 'ignore' });
  }
}

describe('init (integration)', () => {
  let proj: string;
  let dbRoot: string;
  let dbPath: string;

  beforeEach(() => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-init-db-'));
    dbPath = join(dbRoot, 't.db');
    proj = mkdtempSync(join(tmpdir(), 'ctx-init-proj-'));
    mkdirSync(join(proj, '.cursor'), { recursive: true });
    writeFileSync(join(proj, '.cursor', 'rules.md'), 'rules', 'utf8');
    writeFileSync(join(proj, '.env'), 'A=1', 'utf8');
  });

  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    rmSync(dbRoot, { recursive: true, force: true });
  });

  it('creates project without remote using alias from prompt', async () => {
    gitInit(proj);
    const db = openDb(dbPath);
    const r = await init(
      db,
      { cwd: proj, noScan: false, yes: false },
      mockReporter({ prompt: 'from-prompt' }),
    );
    expect(r.created).toBe(true);
    expect(r.linked).toBe(false);
    expect(r.project.alias).toBe('from-prompt');
    expect(r.saved).toBeGreaterThan(0);
    db.close();
  });

  it('b1: existing remote + default confirm links without duplicate row', async () => {
    const origin = 'https://github.com/acme/widget.git';
    gitInit(proj, origin);
    const db = openDb(dbPath);
    const remote = normalizeRemoteUrl(origin);
    const t = nowMs();
    db.prepare(
      `INSERT INTO projects (alias, remote_url, root_path_hint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('seed-alias', remote, '/old/path', t, t);
    const before = db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number };

    const r = await init(db, { cwd: proj, noScan: true, yes: false }, mockReporter());

    expect(r.created).toBe(false);
    expect(r.linked).toBe(true);
    expect(r.project.alias).toBe('seed-alias');
    const after = db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number };
    expect(after.n).toBe(before.n);
    expect(resolve(r.project.root_path_hint ?? '')).toBe(resolve(proj));
    const managed = db
      .prepare('SELECT COUNT(*) AS n FROM managed_files WHERE project_id = ?')
      .get(r.project.id) as { n: number };
    expect(managed.n).toBe(0);
    db.close();
  });

  it('b2: existing remote + confirm false throws cancelled by user', async () => {
    const origin = 'https://github.com/acme/widget.git';
    gitInit(proj, origin);
    const db = openDb(dbPath);
    const remote = normalizeRemoteUrl(origin);
    const t = nowMs();
    db.prepare(
      `INSERT INTO projects (alias, remote_url, root_path_hint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('seed-alias', remote, '/old/path', t, t);

    await expect(
      init(db, { cwd: proj, noScan: true, yes: false }, mockReporter({ confirm: false })),
    ).rejects.toThrow('cancelled by user');
    db.close();
  });

  it('b3: existing remote + --yes auto-links and reports info', async () => {
    const origin = 'https://github.com/acme/widget.git';
    gitInit(proj, origin);
    const db = openDb(dbPath);
    const remote = normalizeRemoteUrl(origin);
    const t = nowMs();
    db.prepare(
      `INSERT INTO projects (alias, remote_url, root_path_hint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('seed-alias', remote, '/old/path', t, t);

    const info = vi.fn();
    const base = mockReporter();
    const reporter = { ...base, info };

    const r = await init(db, { cwd: proj, noScan: true, yes: true }, reporter);

    expect(r.linked).toBe(true);
    expect(r.created).toBe(false);
    expect(info).toHaveBeenCalledWith('remote 已登记为项目 seed-alias，--yes 自动 link');
    expect(resolve(r.project.root_path_hint ?? '')).toBe(resolve(proj));
    db.close();
  });

  it('with --yes selects all default rule matches and persists blobs', async () => {
    const db = openDb(dbPath);
    const r = await init(
      db,
      { cwd: proj, alias: 'yes-all', noScan: false, yes: true },
      mockReporter(),
    );
    expect(r.created).toBe(true);
    expect(r.linked).toBe(false);
    expect(r.selected).toBeGreaterThan(0);
    expect(r.saved).toBe(r.selected);

    const paths = db
      .prepare('SELECT path FROM managed_files WHERE project_id = ? ORDER BY path')
      .all(r.project.id) as Array<{ path: string }>;
    const list = paths.map((p) => p.path);
    expect(list).toContain('.env');
    expect(list).toContain('.cursor/rules.md');
    db.close();
  });

  it('throws when no remote and prompt returns empty alias', async () => {
    gitInit(proj);
    const db = openDb(dbPath);
    await expect(
      init(db, { cwd: proj, noScan: true, yes: true }, mockReporter({ prompt: '' })),
    ).rejects.toThrow(/alias is required/);
    db.close();
  });
});

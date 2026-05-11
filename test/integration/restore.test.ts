import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { init } from '../../src/commands/init.js';
import { restore } from '../../src/commands/restore.js';
import { save } from '../../src/commands/save.js';
import { openDb } from '../../src/db/index.js';
import { mockReporter } from '../helpers/reporter.js';

function gitInit(cwd: string): void {
  execSync('git init', { cwd, stdio: 'ignore' });
  execSync('git config user.email "ctx-test@example.com"', { cwd, stdio: 'ignore' });
  execSync('git config user.name "ctx-test"', { cwd, stdio: 'ignore' });
}

describe('restore (integration)', () => {
  let proj: string;
  let dbRoot: string;
  let dbPath: string;

  beforeEach(() => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-restore-db-'));
    dbPath = join(dbRoot, 't.db');
    proj = mkdtempSync(join(tmpdir(), 'ctx-restore-proj-'));
    mkdirSync(join(proj, '.cursor'), { recursive: true });
    writeFileSync(join(proj, '.cursor', 'rules.md'), 'rules-v0', 'utf8');
    writeFileSync(join(proj, '.env'), 'A=1', 'utf8');
  });

  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    rmSync(dbRoot, { recursive: true, force: true });
  });

  it('fresh working tree: all created paths are written from DB', async () => {
    gitInit(proj);
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'restore-fresh', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    for (const p of ['.env', '.cursor/rules.md']) {
      db.prepare(
        `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
      ).run(project.id, p, ts);
    }
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());

    rmSync(join(proj, '.env'), { force: true });
    rmSync(join(proj, '.cursor', 'rules.md'), { force: true });

    const r = await restore(
      db,
      { cwd: proj, yes: true, noBackup: true, dryRun: false },
      mockReporter(),
    );
    expect(r.dryRun).toBe(false);
    expect(r.restored).toBe(2);
    expect(r.created.sort()).toEqual(['.cursor/rules.md', '.env']);
    expect(r.changed).toEqual([]);
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('A=1');
    expect(readFileSync(join(proj, '.cursor', 'rules.md'), 'utf8')).toBe('rules-v0');
    db.close();
  });

  it('changed files: backup to injected trashRoot then overwrite', async () => {
    gitInit(proj);
    const trashRoot = mkdtempSync(join(tmpdir(), 'ctx-restore-trash-'));
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'restore-bak', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());

    writeFileSync(join(proj, '.env'), 'LOCAL-TAMPER', 'utf8');

    const r = await restore(
      db,
      { cwd: proj, yes: true, noBackup: false, dryRun: false, trashRoot },
      mockReporter(),
    );
    expect(r.changed).toEqual(['.env']);
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('A=1');

    const aliasDirs = readdirSync(trashRoot);
    expect(aliasDirs).toContain(project.alias);
    const tsDirs = readdirSync(join(trashRoot, project.alias));
    expect(tsDirs.length).toBeGreaterThanOrEqual(1);
    const backupDir = join(trashRoot, project.alias, tsDirs[0] as string);
    expect(readFileSync(join(backupDir, '.env'), 'utf8')).toBe('LOCAL-TAMPER');
    expect(existsSync(join(backupDir, 'manifest.json'))).toBe(true);
    rmSync(trashRoot, { recursive: true, force: true });
    db.close();
  });

  it('dry-run does not write; restored=0; dryRun=true', async () => {
    gitInit(proj);
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'restore-dry', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());

    writeFileSync(join(proj, '.env'), 'TAMPERED', 'utf8');
    const r = await restore(
      db,
      { cwd: proj, yes: true, noBackup: true, dryRun: true },
      mockReporter(),
    );
    expect(r).toMatchObject({
      restored: 0,
      dryRun: true,
      changed: ['.env'],
    });
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('TAMPERED');
    db.close();
  });

  it('--only picomatch: restores matching paths only', async () => {
    gitInit(proj);
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'restore-only', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    for (const p of ['.env', '.cursor/rules.md']) {
      db.prepare(
        `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
      ).run(project.id, p, ts);
    }
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());

    writeFileSync(join(proj, '.env'), 'BAD-ENV', 'utf8');
    writeFileSync(join(proj, '.cursor', 'rules.md'), 'BAD-RULES', 'utf8');

    const r = await restore(
      db,
      { cwd: proj, yes: true, noBackup: true, dryRun: false, only: '**/*.md' },
      mockReporter(),
    );
    expect(r.changed).toEqual(['.cursor/rules.md']);
    expect(r.created).toEqual([]);
    expect(readFileSync(join(proj, '.cursor', 'rules.md'), 'utf8')).toBe('rules-v0');
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('BAD-ENV');
    db.close();
  });

  it('rejects DB path ../evil.txt: throws escape error; does not write outside project', async () => {
    gitInit(proj);
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'restore-evil', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());

    const envRow = db
      .prepare(
        'SELECT blob_hash, mode, is_dir, saved_at FROM managed_files WHERE project_id = ? AND path = ?',
      )
      .get(project.id, '.env') as {
      blob_hash: string;
      mode: number;
      is_dir: number;
      saved_at: number;
    };
    db.prepare(
      'INSERT INTO managed_files (project_id, path, blob_hash, mode, is_dir, saved_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(project.id, '../evil.txt', envRow.blob_hash, envRow.mode, envRow.is_dir, envRow.saved_at);

    const evilAbs = join(dirname(proj), 'evil.txt');
    expect(existsSync(evilAbs)).toBe(false);

    await expect(
      restore(db, { cwd: proj, yes: true, noBackup: true, dryRun: false }, mockReporter()),
    ).rejects.toThrow(/escapes/);

    expect(existsSync(evilAbs)).toBe(false);
    db.close();
  });

  it('confirm decline throws cancelled by user when there are overwrites', async () => {
    gitInit(proj);
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'restore-no', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());

    writeFileSync(join(proj, '.env'), 'Nope', 'utf8');

    await expect(
      restore(
        db,
        { cwd: proj, yes: false, noBackup: true, dryRun: false },
        mockReporter({ confirm: false }),
      ),
    ).rejects.toThrow('cancelled by user');
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('Nope');
    db.close();
  });
});

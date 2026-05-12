import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diff } from '../../src/commands/diff.js';
import { init } from '../../src/commands/init.js';
import { save } from '../../src/commands/save.js';
import { status } from '../../src/commands/status.js';
import { openDb } from '../../src/db/index.js';
import { mockReporter } from '../helpers/reporter.js';

describe('status + diff', () => {
  let proj: string;
  let dbRoot: string;
  let dbPath: string;

  beforeEach(() => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-sd-db-'));
    dbPath = join(dbRoot, 't.db');
    proj = mkdtempSync(join(tmpdir(), 'ctx-sd-proj-'));
    mkdirSync(join(proj, '.cursor'), { recursive: true });
    writeFileSync(join(proj, '.cursor', 'rules.md'), 'rules', 'utf8');
    writeFileSync(join(proj, '.env'), 'A=1\n', 'utf8');
  });

  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    rmSync(dbRoot, { recursive: true, force: true });
  });

  it('status: unchanged after save', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'sd1', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    const s = status(db, project.id, proj);
    expect(s.unchanged).toContain('.env');
    expect(s.changed).toEqual([]);
    expect(s.created).toEqual([]);
    expect(s.untracked).toEqual([]);
    db.close();
  });

  it('status: changed when file edited', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'sd2', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    writeFileSync(join(proj, '.env'), 'A=2\n', 'utf8');
    const s = status(db, project.id, proj);
    expect(s.changed).toContain('.env');
    expect(s.unchanged).toEqual([]);
    db.close();
  });

  it('status: untracked file on disk under manifest but not in DB', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'sd3', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, 'extra.txt', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    writeFileSync(join(proj, 'extra.txt'), 'new\n', 'utf8');
    const s = status(db, project.id, proj);
    expect(s.untracked).toContain('extra.txt');
    db.close();
  });

  it('status: created when managed file deleted locally', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'sd4', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    unlinkSync(join(proj, '.env'));
    const s = status(db, project.id, proj);
    expect(s.created).toContain('.env');
    db.close();
  });

  it('diff: unified patch for text file', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'sd5', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, '.env', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    writeFileSync(join(proj, '.env'), 'A=2\n', 'utf8');
    const patch = diff(db, project.id, proj, '.env');
    expect(patch).toMatch(/-A=1/);
    expect(patch).toMatch(/\+A=2/);
    db.close();
  });

  it('diff: binary placeholder with hashes and sizes', async () => {
    const db = openDb(dbPath);
    const { project } = await init(
      db,
      { cwd: proj, alias: 'sd6', noScan: true, yes: true },
      mockReporter(),
    );
    const ts = Date.now();
    writeFileSync(join(proj, 'blob.bin'), Buffer.from([0x00, 0x42, 0xff]));
    db.prepare(
      `INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, ?, 'include', ?)`,
    ).run(project.id, 'blob.bin', ts);
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    writeFileSync(join(proj, 'blob.bin'), Buffer.from([0x01, 0x02, 0x03, 0x00]));
    const out = diff(db, project.id, proj, 'blob.bin');
    expect(out).toMatch(/^<binary file: hash db=/);
    expect(out).toMatch(/local=/);
    expect(out).toMatch(/size db=/);
    db.close();
  });
});

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diff } from '../../src/commands/diff.js';
import { gc } from '../../src/commands/gc.js';
import { init } from '../../src/commands/init.js';
import { projects } from '../../src/commands/projects.js';
import { remove } from '../../src/commands/remove.js';
import { restore } from '../../src/commands/restore.js';
import { save } from '../../src/commands/save.js';
import { status } from '../../src/commands/status.js';
import { listTrash, restoreFromTrash } from '../../src/commands/trash.js';
import { openDb } from '../../src/db/index.js';
import { mockReporter } from '../helpers/reporter.js';

function gitInit(cwd: string): void {
  execSync('git init', { cwd, stdio: 'ignore' });
  execSync('git config user.email "ctx-e2e@example.com"', { cwd, stdio: 'ignore' });
  execSync('git config user.name "ctx-e2e"', { cwd, stdio: 'ignore' });
}

describe('e2e: full CLI-equivalent flow', () => {
  let proj: string;
  let dbRoot: string;
  let dbPath: string;
  let trashRoot: string;

  beforeEach(() => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-e2e-db-'));
    dbPath = join(dbRoot, 't.db');
    proj = mkdtempSync(join(tmpdir(), 'ctx-e2e-proj-'));
    trashRoot = mkdtempSync(join(tmpdir(), 'ctx-e2e-trash-'));
    mkdirSync(join(proj, '.cursor'), { recursive: true });
    writeFileSync(join(proj, '.cursor', 'rules.md'), 'rules-v0', 'utf8');
    writeFileSync(join(proj, '.env'), 'A=1\n', 'utf8');
  });

  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    rmSync(dbRoot, { recursive: true, force: true });
    rmSync(trashRoot, { recursive: true, force: true });
  });

  it('git repo + temp db: init→save→status→diff→restore→trash→projects→remove→gc', async () => {
    gitInit(proj);
    const db = openDb(dbPath);
    const alias = 'e2eflow';

    const { project } = await init(
      db,
      { cwd: proj, alias, noScan: true, yes: true },
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

    const patch = diff(db, project.id, proj, '.env');
    expect(patch).toContain('@@');
    expect(patch).toContain('A=1');
    expect(patch).toContain('A=2');

    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, mockReporter());
    writeFileSync(join(proj, '.env'), 'LOCAL\n', 'utf8');

    const r1 = await restore(
      db,
      {
        cwd: proj,
        yes: true,
        noBackup: false,
        dryRun: false,
        trashRoot,
      },
      mockReporter(),
    );
    expect(r1.changed).toContain('.env');
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('A=2\n');

    const listed = listTrash(trashRoot);
    expect(listed.length).toBeGreaterThanOrEqual(1);
    const entry = listed.find((e) => e.alias === alias);
    expect(entry).toBeDefined();
    expect(entry?.files).toContain('.env');

    const id = entry?.id;
    expect(id).toBeDefined();
    const { restored } = await restoreFromTrash(
      trashRoot,
      id as string,
      proj,
      { yes: true },
      mockReporter(),
    );
    expect(restored).toContain('.env');
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('LOCAL\n');

    let plist = await projects(db);
    expect(plist.some((p) => p.alias === alias)).toBe(true);
    expect(plist.filter((p) => p.alias === alias).length).toBe(1);

    await remove(db, alias, { yes: true }, mockReporter());
    plist = await projects(db);
    expect(plist.some((p) => p.alias === alias)).toBe(false);

    const removed = gc(db);
    expect(removed).toBeGreaterThanOrEqual(0);

    const blobs = db.prepare('SELECT COUNT(*) AS n FROM file_blobs').get() as { n: number };
    expect(blobs.n).toBe(0);

    db.close();
  });
});

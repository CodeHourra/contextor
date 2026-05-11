import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { doctor } from '../../src/commands/doctor.js';
import { gc, vacuum } from '../../src/commands/gc.js';
import { init } from '../../src/commands/init.js';
import { addRule, listRules, rmRule } from '../../src/commands/rules.js';
import { cleanTrash, listTrash, restoreFromTrash, showTrash } from '../../src/commands/trash.js';
import { hashBuffer } from '../../src/core/blob.js';
import { backupToTrash } from '../../src/core/trash.js';
import { openDb } from '../../src/db/index.js';
import { nowMs } from '../../src/utils/time.js';
import { mockReporter } from '../helpers/reporter.js';

describe('rules / trash / doctor / gc', () => {
  let dbRoot: string;
  let dbPath: string;

  beforeEach(() => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-misc-db-'));
    dbPath = join(dbRoot, 't.db');
  });

  afterEach(() => {
    rmSync(dbRoot, { recursive: true, force: true });
  });

  it('rmRule rejects default global rule', () => {
    const db = openDb(dbPath);
    expect(() => rmRule(db, '.cursor/')).toThrow(/default/);
    db.close();
  });

  it('addRule and rmRule for custom pattern', () => {
    const db = openDb(dbPath);
    addRule(db, '.envrc');
    expect(listRules(db).map((r) => r.pattern)).toContain('.envrc');
    rmRule(db, '.envrc');
    expect(listRules(db).map((r) => r.pattern)).not.toContain('.envrc');
    db.close();
  });

  it('listTrash and showTrash read backup manifest', () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-misc-proj-'));
    const trashRoot = mkdtempSync(join(tmpdir(), 'ctx-misc-trash-'));
    try {
      writeFileSync(join(proj, 'note.txt'), 'v1', 'utf8');
      backupToTrash({
        trashRoot,
        projectAlias: 'misc-a',
        projectRoot: proj,
        files: ['note.txt'],
      });
      const list = listTrash(trashRoot);
      expect(list.length).toBe(1);
      expect(list[0]?.files).toContain('note.txt');
      const m = showTrash(trashRoot, list[0]?.id ?? '');
      expect(m.project_alias).toBe('misc-a');
      expect(m.files.map((f) => f.path)).toContain('note.txt');
    } finally {
      rmSync(proj, { recursive: true, force: true });
      rmSync(trashRoot, { recursive: true, force: true });
    }
  });

  it('restoreFromTrash overwrites project files when yes', async () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-misc-proj2-'));
    const trashRoot = mkdtempSync(join(tmpdir(), 'ctx-misc-trash2-'));
    try {
      writeFileSync(join(proj, 'note.txt'), 'from-backup', 'utf8');
      backupToTrash({
        trashRoot,
        projectAlias: 'misc-b',
        projectRoot: proj,
        files: ['note.txt'],
      });
      writeFileSync(join(proj, 'note.txt'), 'edited', 'utf8');
      const id = listTrash(trashRoot)[0]?.id;
      expect(id).toBeTruthy();
      const { restored } = await restoreFromTrash(
        trashRoot,
        id as string,
        proj,
        { yes: true },
        mockReporter(),
      );
      expect(restored).toContain('note.txt');
      expect(readFileSync(join(proj, 'note.txt'), 'utf8')).toBe('from-backup');
    } finally {
      rmSync(proj, { recursive: true, force: true });
      rmSync(trashRoot, { recursive: true, force: true });
    }
  });

  it('restoreFromTrash rejects manifest path ../evil.txt escaping backupRoot', async () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-misc-proj-trash-escape-'));
    const trashRoot = mkdtempSync(join(tmpdir(), 'ctx-misc-trash-escape-'));
    try {
      const backupRoot = join(trashRoot, 'esc-alias', 'esc-ts');
      mkdirSync(backupRoot, { recursive: true });
      writeFileSync(join(trashRoot, 'esc-alias', 'evil.txt'), 'would-be-exfil', 'utf8');
      writeFileSync(
        join(backupRoot, 'manifest.json'),
        JSON.stringify({
          project_alias: 'esc-alias',
          utc_timestamp: new Date().toISOString(),
          files: [{ path: '../evil.txt' }],
        }),
        'utf8',
      );
      const outsideProject = join(dirname(proj), 'evil.txt');
      rmSync(outsideProject, { force: true });

      await expect(
        restoreFromTrash(trashRoot, 'esc-alias/esc-ts', proj, { yes: true }, mockReporter()),
      ).rejects.toThrow(/escapes/);

      expect(existsSync(outsideProject)).toBe(false);
    } finally {
      rmSync(proj, { recursive: true, force: true });
      rmSync(trashRoot, { recursive: true, force: true });
    }
  });

  it('cleanTrash removes backups older than beforeMs', async () => {
    const trashRoot = mkdtempSync(join(tmpdir(), 'ctx-misc-trash3-'));
    try {
      const old = new Date(Date.now() - 14 * 86400000);
      const staleDir = join(trashRoot, 'z', 'stale-ts');
      mkdirSync(staleDir, { recursive: true });
      writeFileSync(
        join(staleDir, 'manifest.json'),
        `${JSON.stringify({ project_alias: 'z', utc_timestamp: old.toISOString(), files: [] })}\n`,
      );
      utimesSync(staleDir, old, old);
      const removed = await cleanTrash(
        trashRoot,
        { beforeMs: Date.now() - 7 * 86400000, yes: true },
        mockReporter(),
      );
      expect(removed).toBe(1);
      expect(listTrash(trashRoot).length).toBe(0);
    } finally {
      rmSync(trashRoot, { recursive: true, force: true });
    }
  });

  it('doctor reports no blocking issues for healthy temp db + linked project', async () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-misc-doc-'));
    try {
      const db = openDb(dbPath);
      await init(db, { cwd: proj, alias: 'docp', noScan: true, yes: true }, mockReporter());
      const r = await doctor(db, proj, mockReporter());
      expect(r.issues).toEqual([]);
      expect(r.ok).toBe(true);
      db.close();
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it('gc removes orphan blobs', () => {
    const db = openDb(dbPath);
    const h = hashBuffer(Buffer.from('orphan-bytes'));
    db.prepare(
      `INSERT INTO file_blobs (hash, content, size, encryption_method, created_at) VALUES (?, ?, ?, 'none', ?)`,
    ).run(h, Buffer.from('orphan-bytes'), 12, nowMs());
    expect(gc(db)).toBe(1);
    const still = db.prepare('SELECT COUNT(*) AS n FROM file_blobs WHERE hash = ?').get(h) as {
      n: number;
    };
    expect(still.n).toBe(0);
    db.close();
  });

  it('vacuum returns file size before and after', () => {
    const db = openDb(dbPath);
    const { before, after } = vacuum(db, dbPath);
    expect(typeof before).toBe('number');
    expect(typeof after).toBe('number');
    expect(after).toBeGreaterThanOrEqual(0);
    db.close();
  });
});

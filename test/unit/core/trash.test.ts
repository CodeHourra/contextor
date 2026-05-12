import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupToTrash, trashSubdir } from '../../../src/core/trash.js';

describe('trash', () => {
  let trashRoot: string;
  let projRoot: string;
  beforeEach(() => {
    trashRoot = mkdtempSync(join(tmpdir(), 'trash-'));
    projRoot = mkdtempSync(join(tmpdir(), 'proj-'));
    writeFileSync(join(projRoot, 'a.txt'), 'A');
  });
  afterEach(() => {
    rmSync(trashRoot, { recursive: true, force: true });
    rmSync(projRoot, { recursive: true, force: true });
  });

  it('trashSubdir composes alias + utc timestamp', () => {
    const sub = trashSubdir(trashRoot, 'foo', new Date('2026-05-11T07:30:42Z'));
    expect(sub).toBe(join(trashRoot, 'foo', '20260511T073042Z'));
  });

  it('backupToTrash copies files and writes manifest.json', () => {
    const dest = backupToTrash({
      trashRoot,
      projectAlias: 'foo',
      projectRoot: projRoot,
      files: ['a.txt'],
      timestamp: new Date('2026-05-11T07:30:42Z'),
    });
    expect(existsSync(join(dest, 'a.txt'))).toBe(true);
    const m = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8'));
    expect(m.project_alias).toBe('foo');
    expect(m.utc_timestamp).toBe('2026-05-11T07:30:42.000Z');
    expect(m.files).toEqual([{ path: 'a.txt' }]);
  });
});

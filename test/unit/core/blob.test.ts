import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gcOrphanBlobs, hashBuffer, putBlob } from '../../../src/core/blob.js';
import { openDb } from '../../../src/db/index.js';

describe('blob', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-blob-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('hashBuffer returns deterministic sha256 hex', () => {
    expect(hashBuffer(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('putBlob is idempotent', () => {
    const db = openDb(join(tmp, 't.db'));
    const buf = Buffer.from('abc');
    const h1 = putBlob(db, buf);
    const h2 = putBlob(db, buf);
    expect(h1).toBe(h2);
    const cnt = db.prepare('SELECT COUNT(*) AS n FROM file_blobs').get() as { n: number };
    expect(cnt.n).toBe(1);
    db.close();
  });

  it('gcOrphanBlobs deletes unreferenced blobs', () => {
    const db = openDb(join(tmp, 't.db'));
    const buf = Buffer.from('orphan');
    putBlob(db, buf);
    const removed = gcOrphanBlobs(db);
    expect(removed).toBe(1);
    const cnt = db.prepare('SELECT COUNT(*) AS n FROM file_blobs').get() as { n: number };
    expect(cnt.n).toBe(0);
    db.close();
  });
});

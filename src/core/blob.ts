import { createHash } from 'node:crypto';
import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';

export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function putBlob(db: Db, content: Buffer): string {
  const hash = hashBuffer(content);
  db.prepare(
    `INSERT OR IGNORE INTO file_blobs (hash, content, size, encryption_method, created_at)
     VALUES (?, ?, ?, 'none', ?)`,
  ).run(hash, content, content.length, nowMs());
  return hash;
}

export function getBlob(db: Db, hash: string): Buffer | null {
  const row = db.prepare('SELECT content FROM file_blobs WHERE hash = ?').get(hash) as
    | { content: Buffer }
    | undefined;
  return row?.content ?? null;
}

export function gcOrphanBlobs(db: Db): number {
  const result = db
    .prepare(
      `DELETE FROM file_blobs
       WHERE hash NOT IN (SELECT DISTINCT blob_hash FROM managed_files)`,
    )
    .run();
  return result.changes;
}

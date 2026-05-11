import { gcOrphanBlobs } from '../core/blob.js';
import { dbFileSize } from '../db/index.js';
import type { Db } from '../db/index.js';

export function gc(db: Db): number {
  return gcOrphanBlobs(db);
}

export function vacuum(db: Db, dbFilePath: string): { before: number; after: number } {
  const before = dbFileSize(dbFilePath);
  db.exec('VACUUM');
  const after = dbFileSize(dbFilePath);
  return { before, after };
}

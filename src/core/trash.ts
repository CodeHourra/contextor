import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { utcIsoCompact } from '../utils/time.js';

export function trashSubdir(trashRoot: string, alias: string, ts: Date = new Date()): string {
  return join(trashRoot, alias, utcIsoCompact(ts));
}

export type BackupParams = {
  trashRoot: string;
  projectAlias: string;
  projectRoot: string;
  files: string[];
  timestamp?: Date;
};

export function backupToTrash(p: BackupParams): string {
  const ts = p.timestamp ?? new Date();
  const dest = trashSubdir(p.trashRoot, p.projectAlias, ts);
  mkdirSync(dest, { recursive: true });
  for (const rel of p.files) {
    const srcAbs = join(p.projectRoot, rel);
    const dstAbs = join(dest, rel);
    mkdirSync(dirname(dstAbs), { recursive: true });
    copyFileSync(srcAbs, dstAbs);
  }
  const manifest = {
    project_alias: p.projectAlias,
    utc_timestamp: ts.toISOString(),
    files: p.files.map((path) => ({ path })),
  };
  writeFileSync(join(dest, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return dest;
}

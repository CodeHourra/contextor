import { constants, accessSync, existsSync, statSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Db } from '../db/index.js';
import { CONTEXTOR_DIR } from '../utils/home.js';
import { lookupProjectByCwd } from './save.js';
import type { Reporter } from './types.js';

export type DoctorReport = {
  ok: boolean;
  issues: string[];
  warnings: string[];
};

export async function doctor(db: Db, cwd: string, _r: Reporter): Promise<DoctorReport> {
  const issues: string[] = [];
  const warnings: string[] = [];

  try {
    const integrity = db.pragma('integrity_check', { simple: true }) as string;
    if (integrity !== 'ok') issues.push(`SQLite integrity_check: ${integrity}`);
  } catch (e) {
    issues.push(`integrity_check failed: ${(e as Error).message}`);
  }

  try {
    const probe = new Database(':memory:');
    probe.close();
  } catch (e) {
    issues.push(`better-sqlite3 native module: ${(e as Error).message}`);
  }

  const dbName = (db as { name: string }).name;
  if (dbName && dbName !== ':memory:') {
    try {
      accessSync(dbName, constants.R_OK | constants.W_OK);
    } catch {
      issues.push(`Database file not readable/writable: ${dbName}`);
    }
  }

  try {
    if (existsSync(CONTEXTOR_DIR)) {
      accessSync(CONTEXTOR_DIR, constants.R_OK | constants.W_OK | constants.X_OK);
      const mode = statSync(CONTEXTOR_DIR).mode & 0o777;
      if (mode !== 0o700)
        warnings.push(`CONTEXTOR_DIR mode is 0${mode.toString(8)} (expected 0700).`);
    } else {
      warnings.push(`CONTEXTOR_DIR does not exist yet: ${CONTEXTOR_DIR}`);
    }
  } catch {
    issues.push(`Cannot access CONTEXTOR_DIR: ${CONTEXTOR_DIR}`);
  }

  const found = lookupProjectByCwd(db, cwd);
  if (!found) warnings.push('Current cwd is not linked to any known project.');
  else if (found === 'unknown') warnings.push('Ambiguous project match for cwd (multiple roots).');

  return { ok: issues.length === 0, issues, warnings };
}

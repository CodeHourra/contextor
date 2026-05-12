import { isAbsolute, relative, resolve, sep } from 'node:path';
import { posix } from 'node:path';

export function toRelPosix(root: string, p: string): string {
  const abs = isAbsolute(p) ? p : resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path "${p}" escapes project root "${root}"`);
  }
  return rel.split(/[\\/]/).filter(Boolean).join('/');
}

export function joinPosix(...parts: string[]): string {
  return posix.join(...parts);
}

/**
 * Resolve a project-relative path safely. Throws if the resolved absolute path
 * escapes projectRoot. Use this anywhere we read a `path` from DB / trash manifest
 * and need to access disk under projectRoot.
 */
export function safeJoin(projectRoot: string, rel: string): string {
  const root = resolve(projectRoot);
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`Path "${rel}" escapes project root "${root}"`);
  }
  return abs;
}

import { isAbsolute, relative, resolve } from 'node:path';
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

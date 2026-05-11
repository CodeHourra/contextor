import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeJoin, toRelPosix } from '../../../src/core/paths.js';

describe('toRelPosix', () => {
  it('normalizes nested path', () => {
    expect(toRelPosix('/a/b', '/a/b/c/d.txt')).toBe('c/d.txt');
  });
  it('throws on parent escape', () => {
    expect(() => toRelPosix('/a/b', '/a/c')).toThrow(/escapes/);
  });
  it('handles relative input', () => {
    expect(toRelPosix('/a/b', 'c/../c/d')).toBe('c/d');
  });
});

describe('safeJoin', () => {
  const root = resolve('/tmp/contextor-safejoin-root');

  it('allows normal nested path under root', () => {
    const abs = safeJoin(root, 'src/foo.ts');
    expect(abs).toBe(resolve(root, 'src/foo.ts'));
  });

  it('throws when path escapes with ..', () => {
    expect(() => safeJoin(root, '../outside.txt')).toThrow(/escapes/);
  });

  it('allows resolved path equal to root', () => {
    expect(safeJoin(root, '.')).toBe(resolve(root));
  });
});

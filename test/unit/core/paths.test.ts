import { describe, expect, it } from 'vitest';
import { toRelPosix } from '../../../src/core/paths.js';

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

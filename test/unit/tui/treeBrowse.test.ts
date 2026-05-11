import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flattenTree, listProjectDir, parentRel } from '../../../src/tui/treeBrowse.js';

describe('treeBrowse', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ctx-tree-'));
    mkdirSync(join(root, 'a', 'b'), { recursive: true });
    writeFileSync(join(root, 'a', 'f.txt'), 'x');
    mkdirSync(join(root, '.git'), { recursive: true });
    writeFileSync(join(root, '.git', 'HEAD'), 'ref:');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('parentRel', () => {
    expect(parentRel('a/b/c')).toBe('a/b');
    expect(parentRel('a')).toBe('');
    expect(parentRel('')).toBe('');
  });

  it('listProjectDir skips .git and sorts dirs first', () => {
    const list = listProjectDir(root, '');
    const names = list.map((e) => e.rel);
    expect(names).toContain('a');
    expect(names.some((n) => n.includes('.git'))).toBe(false);
    expect(list.find((e) => e.rel === 'a')?.isDir).toBe(true);
  });

  it('listProjectDir nested', () => {
    const list = listProjectDir(root, 'a');
    expect(list.some((e) => e.rel === 'a/b' && e.isDir)).toBe(true);
    expect(list.some((e) => e.rel === 'a/f.txt' && !e.isDir)).toBe(true);
  });

  it('flattenTree only descends into expanded dirs', () => {
    const collapsed = flattenTree(root, new Set());
    expect(collapsed.map((n) => n.rel).sort()).toEqual(['a']);
    const expanded = flattenTree(root, new Set(['a']));
    const rels = expanded.map((n) => n.rel);
    expect(rels).toContain('a/b');
    expect(rels).toContain('a/f.txt');
    const child = expanded.find((n) => n.rel === 'a/b');
    expect(child?.depth).toBe(1);
    expect(child?.parent).toBe('a');
  });
});

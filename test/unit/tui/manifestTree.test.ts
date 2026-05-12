import { describe, expect, it } from 'vitest';
import type { ManifestEntry } from '../../../src/core/manifest.js';
import {
  buildManifestTreeIndex,
  flattenManifestTree,
  manifestRowIsDir,
} from '../../../src/tui/manifestTree.js';

describe('buildManifestTreeIndex', () => {
  it('builds parent dirs for nested file include', () => {
    const entries: ManifestEntry[] = [{ path: 'src/a.ts', kind: 'include' }];
    const ix = buildManifestTreeIndex(entries);
    expect(ix.allRels.has('src')).toBe(true);
    expect(ix.allRels.has('src/a.ts')).toBe(true);
    expect(manifestRowIsDir('src', ix)).toBe(true);
    expect(manifestRowIsDir('src/a.ts', ix)).toBe(false);
    expect(ix.meta('src/a.ts').include).toBe(true);
  });

  it('explicit directory row with trailing slash', () => {
    const entries: ManifestEntry[] = [{ path: '.cursor/', kind: 'include' }];
    const ix = buildManifestTreeIndex(entries);
    expect(ix.meta('.cursor').explicitDir).toBe(true);
    expect(manifestRowIsDir('.cursor', ix)).toBe(true);
  });

  it('flatten respects expanded set', () => {
    const entries: ManifestEntry[] = [
      { path: 'a/x.txt', kind: 'include' },
      { path: 'b/y.txt', kind: 'exclude' },
    ];
    const ix = buildManifestTreeIndex(entries);
    const collapsed = flattenManifestTree(ix, new Set());
    expect(collapsed.map((r) => r.rel)).toEqual(['a', 'b']);
    const expanded = flattenManifestTree(ix, new Set(['a', 'b']));
    expect(expanded.some((r) => r.rel === 'a/x.txt')).toBe(true);
    expect(expanded.some((r) => r.rel === 'b/y.txt')).toBe(true);
  });
});

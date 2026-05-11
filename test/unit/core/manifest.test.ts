import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expandManifest } from '../../../src/core/manifest.js';

describe('expandManifest', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-mani-'));
    mkdirSync(join(tmp, '.cursor'), { recursive: true });
    writeFileSync(join(tmp, '.cursor', 'rules.md'), 'r');
    mkdirSync(join(tmp, '.cursor', 'cache'), { recursive: true });
    writeFileSync(join(tmp, '.cursor', 'cache', 'big.bin'), 'x');
    writeFileSync(join(tmp, '.env'), 'A=1');
    writeFileSync(join(tmp, 'AGENTS.md'), '# a');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('directory pattern recurses', () => {
    const r = expandManifest(tmp, [{ path: '.cursor/', kind: 'include' }]);
    expect(r.map((e) => e.rel).sort()).toEqual([
      '.cursor',
      '.cursor/cache',
      '.cursor/cache/big.bin',
      '.cursor/rules.md',
    ]);
  });

  it('exclude removes subdir', () => {
    const r = expandManifest(tmp, [
      { path: '.cursor/', kind: 'include' },
      { path: '.cursor/cache/', kind: 'exclude' },
    ]);
    expect(r.map((e) => e.rel).sort()).toEqual(['.cursor', '.cursor/rules.md']);
  });

  it('glob pattern matches', () => {
    const r = expandManifest(tmp, [{ path: '.env*', kind: 'include' }]);
    expect(r.map((e) => e.rel)).toEqual(['.env']);
  });

  it('exact file', () => {
    const r = expandManifest(tmp, [{ path: 'AGENTS.md', kind: 'include' }]);
    expect(r.map((e) => e.rel)).toEqual(['AGENTS.md']);
  });
});

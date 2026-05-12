import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanByRules } from '../../../src/core/scanner.js';

describe('scanByRules', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-scan-'));
    mkdirSync(join(tmp, '.git'), { recursive: true });
    writeFileSync(join(tmp, '.git', 'HEAD'), 'x');
    mkdirSync(join(tmp, '.cursor'), { recursive: true });
    writeFileSync(join(tmp, '.cursor', 'rules.md'), 'r');
    writeFileSync(join(tmp, '.env'), 'A=1');
    writeFileSync(join(tmp, '.env.local'), 'B=2');
    writeFileSync(join(tmp, 'AGENTS.md'), '#');
    writeFileSync(join(tmp, 'README.md'), '#'); // not in rules
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('matches default rules and skips .git', () => {
    const r = scanByRules(tmp, ['.cursor/', '.env*', 'AGENTS.md']);
    const rels = r.map((e) => e.rel).sort();
    expect(rels).toEqual(['.cursor', '.cursor/rules.md', '.env', '.env.local', 'AGENTS.md']);
  });
});

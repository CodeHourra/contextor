import { describe, expect, it } from 'vitest';
import { classifyConflicts } from '../../../src/core/conflict.js';

describe('classifyConflicts', () => {
  it('classifies NEW / CHANGED / UNTRACKED', () => {
    const target = [
      { rel: 'a.txt', hash: 'h1' },
      { rel: 'b.txt', hash: 'h2' },
      { rel: 'c/d.txt', hash: 'h3' },
    ];
    const local = new Map<string, string | null>([
      ['a.txt', null], // missing locally → NEW
      ['b.txt', 'h2'], // unchanged → ignored
      ['c/d.txt', 'h3-different'], // changed → CHANGED
      ['extra.txt', 'hX'], // local-only → UNTRACKED
    ]);
    const r = classifyConflicts(target, local);
    expect(r.created).toEqual(['a.txt']);
    expect(r.changed).toEqual(['c/d.txt']);
    expect(r.untracked).toEqual(['extra.txt']);
    expect(r.unchanged).toEqual(['b.txt']);
  });
});

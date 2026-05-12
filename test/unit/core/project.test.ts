import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectProjectRoot, findGitRoot, normalizeRemoteUrl } from '../../../src/core/project.js';

describe('normalizeRemoteUrl', () => {
  it('strips https + .git + lowercases', () => {
    expect(normalizeRemoteUrl('https://github.com/Foo/Bar.git')).toBe('github.com/foo/bar');
  });
  it('handles ssh form git@host:owner/repo.git', () => {
    expect(normalizeRemoteUrl('git@github.com:Foo/Bar.git')).toBe('github.com/foo/bar');
  });
  it('handles ssh+git protocol', () => {
    expect(normalizeRemoteUrl('ssh://git@gitlab.com/foo/bar')).toBe('gitlab.com/foo/bar');
  });
  it('strips trailing slash', () => {
    expect(normalizeRemoteUrl('https://github.com/foo/bar/')).toBe('github.com/foo/bar');
  });
  it('returns empty string for invalid input', () => {
    expect(normalizeRemoteUrl('')).toBe('');
  });
});

describe('findGitRoot', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'contextor-git-')));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns null when no .git found', () => {
    expect(findGitRoot(tmp)).toBe(null);
  });

  it('walks up to find .git', () => {
    mkdirSync(join(tmp, '.git'));
    const sub = join(tmp, 'a', 'b');
    mkdirSync(sub, { recursive: true });
    expect(findGitRoot(sub)).toBe(tmp);
  });
});

describe('detectProjectRoot', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'contextor-detect-')));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('falls back to cwd when no git', () => {
    const r = detectProjectRoot(tmp);
    expect(r.root).toBe(tmp);
    expect(r.remote).toBe(null);
  });
});

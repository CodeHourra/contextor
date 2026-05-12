import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectProjectRoot,
  findGitRoot,
  normalizeRemoteUrl,
  resolveProjectDiskRoot,
} from '../../../src/core/project.js';

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

describe('resolveProjectDiskRoot', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'contextor-diskroot-')));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('with remote_url: uses cwd git root / resolved cwd, not stale root_path_hint', () => {
    mkdirSync(join(tmp, '.git'));
    const sub = join(tmp, 'pkg');
    mkdirSync(sub, { recursive: true });
    const stale = join(tmpdir(), 'stale-other-clone');
    expect(
      resolveProjectDiskRoot({ remote_url: 'github.com/foo/bar', root_path_hint: stale }, sub),
    ).toBe(tmp);
  });

  it('without remote: prefers root_path_hint over cwd when no git at cwd', () => {
    const hinted = join(tmp, 'monorepo-root');
    mkdirSync(hinted, { recursive: true });
    const sub = join(hinted, 'packages', 'a');
    mkdirSync(sub, { recursive: true });
    expect(resolveProjectDiskRoot({ remote_url: null, root_path_hint: hinted }, sub)).toBe(hinted);
  });
});

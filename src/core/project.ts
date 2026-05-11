import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';

export function normalizeRemoteUrl(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  // git@host:owner/repo(.git)
  const sshMatch = s.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    s = `${sshMatch[1]}/${sshMatch[2]}`;
  } else {
    s = s.replace(/^https?:\/\//i, '').replace(/^ssh:\/\/(?:git@)?/i, '');
  }
  s = s
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return s;
}

export function findGitRoot(start: string): string | null {
  let cur = resolve(start);
  const root = parse(cur).root;
  while (true) {
    if (existsSync(`${cur}/.git`)) return cur;
    if (cur === root) return null;
    cur = dirname(cur);
  }
}

export function readOriginRemote(repoRoot: string): string | null {
  try {
    const out = execSync('git remote get-url origin', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

export function detectProjectRoot(cwd: string): { root: string; remote: string | null } {
  const gitRoot = findGitRoot(cwd);
  if (gitRoot) {
    const raw = readOriginRemote(gitRoot);
    return { root: gitRoot, remote: raw ? normalizeRemoteUrl(raw) : null };
  }
  return { root: resolve(cwd), remote: null };
}

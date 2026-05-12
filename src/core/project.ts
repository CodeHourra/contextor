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

/**
 * 解析「落盘」用的项目根目录。
 *
 * - 已绑定 **remote** 的项目：同一远端可在多个目录 clone，DB 里的 `root_path_hint` 可能仍是旧路径；
 *   此时必须以 **当前 cwd 解析出的 git 根** 为准，否则 save/restore/status/diff 会读写错目录。
 * - **无 remote** 的项目：依赖路径识别，沿用 `root_path_hint`（无则 cwd 根）。
 */
export function resolveProjectDiskRoot(
  project: { remote_url: string | null; root_path_hint: string | null },
  cwd: string,
): string {
  const { root } = detectProjectRoot(cwd);
  if (project.remote_url) {
    return resolve(root);
  }
  return resolve(project.root_path_hint ?? root);
}

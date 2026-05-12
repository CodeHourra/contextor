import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectRow } from '../../src/commands/types.js';
import { normalizeRemoteUrl } from '../../src/core/project.js';
import { openDb } from '../../src/db/index.js';
import { TuiProvider } from '../../src/tui/context.js';
import { MainMenu } from '../../src/tui/screens/MainMenu.js';
import { nowMs } from '../../src/utils/time.js';

function gitInit(cwd: string, originUrl: string): void {
  execSync('git init', { cwd, stdio: 'ignore' });
  execSync('git config user.email "tui-test@example.com"', { cwd, stdio: 'ignore' });
  execSync('git config user.name "tui-test"', { cwd, stdio: 'ignore' });
  execSync(`git remote add origin ${originUrl}`, { cwd, stdio: 'ignore' });
}

describe('tui (integration)', () => {
  let dbRoot: string;
  let dbPath: string;
  let proj: string;

  beforeEach(() => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-tui-db-'));
    dbPath = join(dbRoot, 't.db');
    proj = mkdtempSync(join(tmpdir(), 'ctx-tui-proj-'));
  });

  afterEach(() => {
    rmSync(dbRoot, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  });

  it('smoke: MainMenu without project hides save', () => {
    gitInit(proj, 'https://github.com/acme/tui-smoke.git');
    const db = openDb(dbPath);
    const { lastFrame } = render(
      <TuiProvider db={db} cwd={proj} initialProject={null}>
        <MainMenu />
      </TuiProvider>,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('init');
    expect(frame).not.toMatch(/\bsave\b/);
    db.close();
  });

  it('smoke: MainMenu with current project shows save', () => {
    const origin = 'https://github.com/acme/tui-proj.git';
    gitInit(proj, origin);
    const db = openDb(dbPath);
    const remote = normalizeRemoteUrl(origin);
    const t = nowMs();
    db.prepare(
      `INSERT INTO projects (alias, remote_url, root_path_hint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('p1', remote, proj, t, t);
    const row = db.prepare('SELECT * FROM projects WHERE alias = ?').get('p1') as ProjectRow;

    const { lastFrame } = render(
      <TuiProvider db={db} cwd={proj} initialProject={row}>
        <MainMenu />
      </TuiProvider>,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/\bsave\b/);
    db.close();
  });
});

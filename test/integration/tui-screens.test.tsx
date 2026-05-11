import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../../src/db/index.js';
import { TuiProvider } from '../../src/tui/context.js';
import { ScreenInit } from '../../src/tui/screens/ScreenInit.js';

function gitInit(cwd: string, originUrl: string): void {
  execSync('git init', { cwd, stdio: 'ignore' });
  execSync('git config user.email "scr@example.com"', { cwd, stdio: 'ignore' });
  execSync('git config user.name "scr"', { cwd, stdio: 'ignore' });
  execSync(`git remote add origin ${originUrl}`, { cwd, stdio: 'ignore' });
}

describe('tui screens (integration)', () => {
  let dbRoot: string;
  let proj: string;

  afterEach(() => {
    rmSync(dbRoot, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  });

  it('smoke: ScreenInit renders and completes init in temp git project', async () => {
    dbRoot = mkdtempSync(join(tmpdir(), 'ctx-scr-db-'));
    proj = mkdtempSync(join(tmpdir(), 'ctx-scr-proj-'));
    gitInit(proj, 'https://github.com/acme/tui-scr-init.git');
    const db = openDb(join(dbRoot, 'app.db'));
    const { lastFrame, unmount } = render(
      <TuiProvider db={db} cwd={proj} initialProject={null}>
        <ScreenInit />
      </TuiProvider>,
    );
    await vi.waitFor(
      () => {
        const f = lastFrame() ?? '';
        expect(f).toMatch(/Created|Linked/);
      },
      { timeout: 12_000 },
    );
    unmount();
    db.close();
  });
});

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { render } from 'ink';
import { useEffect, useMemo } from 'react';
import { lookupProjectByCwd } from '../commands/save.js';
import { openDb } from '../db/index.js';
import { DB_PATH } from '../utils/home.js';
import { TuiProvider, useTui } from './context.js';
import { MainMenu } from './screens/MainMenu.js';
import { screenRegistry } from './screens/registry.js';

function TuiRouter() {
  const { screen } = useTui();
  if (screen === 'main') return <MainMenu />;
  const Cmp = screenRegistry[screen];
  return <Cmp />;
}

export type RunTuiOpts = { db?: string; cwd?: string };

function TuiRoot({ opts = {} }: { opts?: RunTuiOpts }) {
  const db = useMemo(() => {
    const path = opts.db ? resolve(opts.db) : DB_PATH;
    if (path !== DB_PATH) {
      mkdirSync(dirname(path), { recursive: true });
    }
    return openDb(path);
  }, [opts.db]);
  const cwd = useMemo(() => (opts.cwd ? resolve(opts.cwd) : process.cwd()), [opts.cwd]);
  const initialProject = useMemo(() => {
    const p = lookupProjectByCwd(db, cwd);
    return p === 'unknown' || !p ? null : p;
  }, [db, cwd]);

  useEffect(
    () => () => {
      db.close();
    },
    [db],
  );

  return (
    <TuiProvider db={db} cwd={cwd} initialProject={initialProject}>
      <TuiRouter />
    </TuiProvider>
  );
}

export async function runTui(opts: RunTuiOpts = {}): Promise<void> {
  const inst = render(<TuiRoot opts={opts} />);
  await inst.waitUntilExit();
}

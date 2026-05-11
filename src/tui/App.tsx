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

function TuiRoot() {
  const db = useMemo(() => openDb(DB_PATH), []);
  const cwd = process.cwd();
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

export async function runTui(): Promise<void> {
  const inst = render(<TuiRoot />);
  await inst.waitUntilExit();
}

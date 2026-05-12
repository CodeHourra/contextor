import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { lookupProjectByCwd } from '../commands/save.js';
import type { ProjectRow } from '../commands/types.js';
import type { Db } from '../db/index.js';
import type { ScreenName } from './types.js';

export type TuiContext = {
  db: Db;
  cwd: string;
  currentProject: ProjectRow | null;
  screen: ScreenName;
  setScreen: (s: ScreenName) => void;
  /** Re-query DB after init/link so MainMenu shows project-bound commands. */
  refreshProject: () => void;
};

const Ctx = createContext<TuiContext | null>(null);

export function TuiProvider({
  children,
  db,
  cwd,
  initialProject,
}: {
  children: ReactNode;
  db: Db;
  cwd: string;
  initialProject: ProjectRow | null;
}) {
  const [screen, setScreen] = useState<ScreenName>('main');
  const [currentProject, setCurrentProject] = useState<ProjectRow | null>(initialProject);
  const refreshProject = useCallback(() => {
    const p = lookupProjectByCwd(db, cwd);
    setCurrentProject(p === 'unknown' || !p ? null : p);
  }, [db, cwd]);

  const value = useMemo(
    (): TuiContext => ({
      db,
      cwd,
      currentProject,
      screen,
      setScreen,
      refreshProject,
    }),
    [db, cwd, currentProject, screen, refreshProject],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTui(): TuiContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTui must be used within TuiProvider');
  return v;
}

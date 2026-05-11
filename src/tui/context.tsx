import { type ReactNode, createContext, useContext, useMemo, useState } from 'react';
import type { ProjectRow } from '../commands/types.js';
import type { Db } from '../db/index.js';
import type { ScreenName } from './types.js';

export type TuiContext = {
  db: Db;
  cwd: string;
  currentProject: ProjectRow | null;
  screen: ScreenName;
  setScreen: (s: ScreenName) => void;
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
  const value = useMemo(
    (): TuiContext => ({
      db,
      cwd,
      currentProject: initialProject,
      screen,
      setScreen,
    }),
    [db, cwd, initialProject, screen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTui(): TuiContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTui must be used within TuiProvider');
  return v;
}

import type { ComponentType } from 'react';
import type { ScreenName } from '../types.js';
import { ScreenAdd } from './ScreenAdd.js';
import { ScreenDiff } from './ScreenDiff.js';
import { ScreenDoctor } from './ScreenDoctor.js';
import { ScreenGC } from './ScreenGC.js';
import { ScreenInit } from './ScreenInit.js';
import { ScreenLink } from './ScreenLink.js';
import { ScreenLs } from './ScreenLs.js';
import { ScreenProjects } from './ScreenProjects.js';
import { ScreenRemove } from './ScreenRemove.js';
import { ScreenRename } from './ScreenRename.js';
import { ScreenRestore } from './ScreenRestore.js';
import { ScreenRm } from './ScreenRm.js';
import { ScreenRules } from './ScreenRules.js';
import { ScreenSave } from './ScreenSave.js';
import { ScreenStatus } from './ScreenStatus.js';
import { ScreenTrash } from './ScreenTrash.js';

export const screenRegistry: Record<Exclude<ScreenName, 'main'>, ComponentType> = {
  init: ScreenInit,
  save: ScreenSave,
  restore: ScreenRestore,
  add: ScreenAdd,
  rm: ScreenRm,
  ls: ScreenLs,
  status: ScreenStatus,
  diff: ScreenDiff,
  projects: ScreenProjects,
  link: ScreenLink,
  rules: ScreenRules,
  trash: ScreenTrash,
  doctor: ScreenDoctor,
  gc: ScreenGC,
  rename: ScreenRename,
  remove: ScreenRemove,
};

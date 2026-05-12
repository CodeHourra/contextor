import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONTEXTOR_DIR = join(homedir(), '.contextor');
export const DB_PATH = join(CONTEXTOR_DIR, 'contextor.db');
export const TRASH_DIR = join(CONTEXTOR_DIR, 'trash');

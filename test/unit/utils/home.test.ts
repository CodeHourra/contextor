import { describe, expect, it } from 'vitest';
import { CONTEXTOR_DIR, DB_PATH, TRASH_DIR } from '../../../src/utils/home.js';

describe('home paths', () => {
  it('CONTEXTOR_DIR ends with .contextor', () => {
    expect(CONTEXTOR_DIR.endsWith('/.contextor')).toBe(true);
  });
  it('DB_PATH is contextor.db under CONTEXTOR_DIR', () => {
    expect(DB_PATH).toBe(`${CONTEXTOR_DIR}/contextor.db`);
  });
  it('TRASH_DIR is trash under CONTEXTOR_DIR', () => {
    expect(TRASH_DIR).toBe(`${CONTEXTOR_DIR}/trash`);
  });
});

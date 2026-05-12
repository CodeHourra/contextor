import type { Key } from 'ink';
import { describe, expect, it } from 'vitest';
import { wantsEscapeLike } from '../../../src/tui/escapeLike.js';

function key(partial: Partial<Key>): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    ...partial,
  };
}

describe('wantsEscapeLike', () => {
  it('Escape key', () => {
    expect(wantsEscapeLike(key({ escape: true }), '')).toBe(true);
  });

  it('Ctrl+[', () => {
    expect(wantsEscapeLike(key({ ctrl: true }), '[')).toBe(true);
  });

  it('Ctrl+G (BEL)', () => {
    expect(wantsEscapeLike(key({ ctrl: true }), '\u0007')).toBe(true);
  });

  it('plain letter g is not back', () => {
    expect(wantsEscapeLike(key({}), 'g')).toBe(false);
  });
});

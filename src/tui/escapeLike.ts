import type { Key } from 'ink';

/**
 * JetBrains IDEA 等默认把终端里的 Esc 交给编辑器，导致 Ink 收不到 escape。
 * 把这些组合视为与 Esc 等价（返回上一级 / 主菜单）。
 */
export function wantsEscapeLike(key: Key, input: string): boolean {
  if (key.escape) return true;
  if (key.ctrl && input === '[') return true;
  // Ctrl+G（BEL）在多数终端里可到达进程，用作备用「取消/返回」
  if (key.ctrl && input === '\u0007') return true;
  return false;
}

/** 简短脚注，供 Footer 拼接 */
export const ESCAPE_LIKE_HINT = 'esc · ctrl+[ · ctrl+G';

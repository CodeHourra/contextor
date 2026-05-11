export function nowMs(): number {
  return Date.now();
}

export function utcIsoCompact(d: Date = new Date()): string {
  // 2026-05-11T07:30:42Z → 20260511T073042Z（用于文件夹名）
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export type Target = { rel: string; hash: string };

export type Classification = {
  created: string[]; // T 有, L 无
  changed: string[]; // T 有, L 有, hash 不同
  unchanged: string[]; // T 有, L 有, hash 相同
  untracked: string[]; // L 有, T 无
};

export function classifyConflicts(
  target: Target[],
  local: Map<string, string | null>,
): Classification {
  const created: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  const untracked: string[] = [];

  const tSet = new Set(target.map((t) => t.rel));

  for (const t of target) {
    const lh = local.get(t.rel);
    if (lh == null) created.push(t.rel);
    else if (lh === t.hash) unchanged.push(t.rel);
    else changed.push(t.rel);
  }

  for (const [rel] of local) {
    if (!tSet.has(rel)) untracked.push(rel);
  }

  return {
    created: created.sort(),
    changed: changed.sort(),
    unchanged: unchanged.sort(),
    untracked: untracked.sort(),
  };
}

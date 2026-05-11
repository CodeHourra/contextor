import type { ExpandedFile, ManifestEntry } from './manifest.js';
import { expandManifest } from './manifest.js';

export function scanByRules(root: string, patterns: string[]): ExpandedFile[] {
  const entries: ManifestEntry[] = patterns.map((p) => ({ path: p, kind: 'include' as const }));
  return expandManifest(root, entries);
}

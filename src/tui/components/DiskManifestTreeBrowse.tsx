import { Box, Text, useInput } from 'ink';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo } from 'react';
import type { ManifestEntry } from '../../core/manifest.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';
import { buildExpandedManifestRelSet, manifestBrowseRowOverlay } from '../manifestBrowseOverlay.js';
import type { FlatNode } from '../treeBrowse.js';
import { Footer } from './Footer.js';

const VIEWPORT = 18;

export function manifestKeyForNode(n: { rel: string; isDir: boolean }): string {
  return n.isDir ? `${n.rel}/` : n.rel;
}

export type DiskManifestPickProps = {
  selected: ReadonlySet<string>;
  selectedCount: number;
  msg: string | null;
  onToggleSelect: (n: FlatNode) => void;
  onInvertListed: () => void;
  onSelectAllListed: () => void;
  onClearListed: () => void;
  onContinue: () => void;
};

type Props = {
  projectRoot: string;
  manifestEntries: ManifestEntry[];
  nodes: FlatNode[];
  expanded: ReadonlySet<string>;
  setExpanded: Dispatch<SetStateAction<ReadonlySet<string>>>;
  cursor: number;
  setCursor: Dispatch<SetStateAction<number>>;
  title: string;
  subtitles?: string[];
  pick?: DiskManifestPickProps;
  onBrowseEscape: () => void;
  backTarget: string;
};

/**
 * 磁盘目录树 + manifest 命中标记（# / !）。供 ls 只读与 add/rm browse 复用。
 */
export function DiskManifestTreeBrowse({
  projectRoot,
  manifestEntries,
  nodes,
  expanded,
  setExpanded,
  cursor,
  setCursor,
  title,
  subtitles,
  pick,
  onBrowseEscape,
  backTarget,
}: Props) {
  const expandedManifestRels = useMemo(
    () => buildExpandedManifestRelSet(projectRoot, manifestEntries),
    [projectRoot, manifestEntries],
  );

  const rowOverlay = useMemo(() => {
    const m = new Map<string, { include: boolean; exclude: boolean }>();
    for (const n of nodes) {
      m.set(n.rel, manifestBrowseRowOverlay(n, manifestEntries, expandedManifestRels));
    }
    return m;
  }, [nodes, manifestEntries, expandedManifestRels]);

  useEffect(() => {
    if (cursor > nodes.length - 1) setCursor(Math.max(0, nodes.length - 1));
  }, [nodes.length, cursor, setCursor]);

  useInput(
    (input, key) => {
      if (wantsEscapeLike(key, input)) {
        onBrowseEscape();
        return;
      }
      if (nodes.length === 0) return;
      const cur = nodes[cursor];
      if (!cur) return;

      if (key.upArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((c) => Math.min(nodes.length - 1, c + 1));
        return;
      }
      if (key.leftArrow) {
        if (cur.isDir && expanded.has(cur.rel)) {
          setExpanded((ex) => {
            const next = new Set(ex);
            next.delete(cur.rel);
            return next;
          });
        } else if (cur.parent) {
          const idx = nodes.findIndex((n) => n.rel === cur.parent);
          if (idx >= 0) setCursor(idx);
        }
        return;
      }
      if (key.rightArrow) {
        if (cur.isDir && !expanded.has(cur.rel)) {
          setExpanded((ex) => {
            const next = new Set(ex);
            next.add(cur.rel);
            return next;
          });
        }
        return;
      }
      if (key.return) {
        if (cur.isDir) {
          setExpanded((ex) => {
            const next = new Set(ex);
            if (next.has(cur.rel)) next.delete(cur.rel);
            else next.add(cur.rel);
            return next;
          });
        } else if (pick) {
          pick.onToggleSelect(cur);
        }
        return;
      }
      if (pick && input === ' ') {
        pick.onToggleSelect(cur);
        return;
      }
      if (pick && (input === 'i' || input === 'I')) {
        pick.onInvertListed();
        return;
      }
      if (pick && (input === 'a' || input === 'A')) {
        pick.onSelectAllListed();
        return;
      }
      if (pick && (input === 'z' || input === 'Z')) {
        pick.onClearListed();
        return;
      }
      if (pick && input === 'c') {
        pick.onContinue();
      }
    },
    { isActive: true },
  );

  if (nodes.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        <Text color="yellow">Project root is empty (or unreadable).</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → ${backTarget}`} />
      </Box>
    );
  }

  const start = Math.max(0, Math.min(nodes.length - VIEWPORT, cursor - Math.floor(VIEWPORT / 2)));
  const end = Math.min(nodes.length, start + VIEWPORT);
  const window = nodes.slice(start, end);
  const selectedCount = pick?.selectedCount ?? 0;

  const legendPick =
    '[x]/[ ] = this action selection · # = in manifest (include) · ! = exclude rule · · = not in manifest';
  const legendReadonly = '# = manifest include · ! = exclude · · = not listed in manifest';

  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {subtitles?.map((s) => (
        <Text key={s} dimColor>
          {s}
        </Text>
      ))}
      <Text dimColor>
        {pick
          ? `${projectRoot} · ${selectedCount} selected · ${cursor + 1}/${nodes.length}`
          : `${projectRoot} · ${cursor + 1}/${nodes.length}`}
      </Text>
      <Text dimColor>{pick ? legendPick : legendReadonly}</Text>
      <Box flexDirection="column" marginTop={1}>
        {window.map((n, i) => {
          const idx = start + i;
          const focused = idx === cursor;
          const indent = '  '.repeat(n.depth);
          const chevron = n.isDir ? (expanded.has(n.rel) ? '▾' : '▸') : ' ';
          const o = rowOverlay.get(n.rel) ?? { include: false, exclude: false };
          let manTag = ' ·';
          if (o.exclude && o.include) manTag = '!#';
          else if (o.exclude) manTag = ' !';
          else if (o.include) manTag = ' #';
          const tail = n.isDir ? '/' : '';
          const checked = pick ? pick.selected.has(manifestKeyForNode(n)) : false;
          const mark = pick ? (checked ? '[x]' : '[ ]') : '   ';
          const line = `${focused ? '› ' : '  '}${indent}${chevron} ${mark}${manTag} ${n.name}${tail}`;
          let color: string | undefined;
          if (focused) color = 'cyan';
          else if (o.exclude) color = 'red';
          else if (o.include || checked) color = 'green';
          return (
            <Text
              key={n.rel}
              bold={focused}
              color={color}
              dimColor={!focused && n.isDir && !o.exclude && !o.include}
            >
              {line}
            </Text>
          );
        })}
      </Box>
      {pick?.msg && <Text color="yellow">{pick.msg}</Text>}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          ↑↓ move · → expand · ← collapse/parent · enter toggle
          {pick ? ' dir / file select' : ' dir'}
        </Text>
        <Text dimColor>
          {pick
            ? `space toggle · i invert listed · a all listed · z clear listed · c continue · ${ESCAPE_LIKE_HINT} → ${backTarget}`
            : `${ESCAPE_LIKE_HINT} → ${backTarget}`}
        </Text>
      </Box>
    </Box>
  );
}

import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import type { ManifestEntry } from '../../core/manifest.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';
import {
  type ManifestFlatRow,
  buildManifestTreeIndex,
  flattenManifestTree,
} from '../manifestTree.js';
import { Footer } from './Footer.js';

const VIEWPORT = 18;

function kindMark(n: ManifestFlatRow): string {
  if (n.include && n.exclude) return '[±]';
  if (n.exclude) return '[!]';
  if (n.include) return '[+]';
  return '[·]';
}

type Props = {
  entries: ManifestEntry[];
  /** 主标题，如 `ls (manifest)` 或项目 alias */
  title: string;
  /** 副标题行（dim），如 remote、fileCount */
  subtitles?: string[];
  onBack: () => void;
  /** Footer 中「返回」目标文案，如 main menu / project list */
  backTarget: string;
};

/**
 * 只读 manifest 虚拟树：↑↓ 移动，→ 展开目录，← 折叠或到父级，Enter 目录切换展开。
 */
export function ManifestEntryTreeBrowse({ entries, title, subtitles, onBack, backTarget }: Props) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [cursor, setCursor] = useState(0);

  const index = useMemo(() => buildManifestTreeIndex(entries), [entries]);
  const nodes = useMemo(() => flattenManifestTree(index, expanded), [index, expanded]);

  useEffect(() => {
    if (cursor > nodes.length - 1) setCursor(Math.max(0, nodes.length - 1));
  }, [nodes.length, cursor]);

  useInput(
    (input, key) => {
      if (wantsEscapeLike(key, input)) {
        onBack();
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
          const next = new Set(expanded);
          next.delete(cur.rel);
          setExpanded(next);
        } else if (cur.parent != null) {
          const idx = nodes.findIndex((n) => n.rel === cur.parent);
          if (idx >= 0) setCursor(idx);
        }
        return;
      }
      if (key.rightArrow) {
        if (cur.isDir && !expanded.has(cur.rel)) {
          const next = new Set(expanded);
          next.add(cur.rel);
          setExpanded(next);
        }
        return;
      }
      if (key.return && cur.isDir) {
        const next = new Set(expanded);
        if (next.has(cur.rel)) next.delete(cur.rel);
        else next.add(cur.rel);
        setExpanded(next);
      }
    },
    { isActive: true },
  );

  if (entries.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        {subtitles?.map((s) => (
          <Text key={s} dimColor>
            {s}
          </Text>
        ))}
        <Text color="yellow">No manifest entries.</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → ${backTarget}`} />
      </Box>
    );
  }

  if (nodes.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        {subtitles?.map((s) => (
          <Text key={s} dimColor>
            {s}
          </Text>
        ))}
        <Text color="yellow">Could not build tree from manifest.</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → ${backTarget}`} />
      </Box>
    );
  }

  const start = Math.max(0, Math.min(nodes.length - VIEWPORT, cursor - Math.floor(VIEWPORT / 2)));
  const end = Math.min(nodes.length, start + VIEWPORT);
  const window = nodes.slice(start, end);

  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {subtitles?.map((s) => (
        <Text key={s} dimColor>
          {s}
        </Text>
      ))}
      <Text dimColor>
        {nodes.length} path(s) in tree · {cursor + 1}/{nodes.length}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {window.map((n, i) => {
          const idx = start + i;
          const focused = idx === cursor;
          const indent = '  '.repeat(n.depth);
          const chevron = n.isDir ? (expanded.has(n.rel) ? '▾' : '▸') : ' ';
          const tail = n.isDir ? '/' : '';
          const mark = kindMark(n);
          const line = `${focused ? '› ' : '  '}${indent}${chevron} ${mark} ${n.name}${tail}`;
          let color: string | undefined;
          if (focused) color = 'cyan';
          else if (n.exclude && !n.include) color = 'red';
          else if (n.include) color = 'green';
          return (
            <Text
              key={n.rel}
              bold={focused}
              color={color}
              dimColor={!focused && n.isDir && !n.include}
            >
              {line}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>↑↓ move · → expand · ← collapse/parent · enter toggle dir</Text>
        <Text dimColor>{`${ESCAPE_LIKE_HINT} → ${backTarget}`}</Text>
      </Box>
    </Box>
  );
}

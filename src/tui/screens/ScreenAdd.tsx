import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { useEffect, useMemo, useState } from 'react';
import { add } from '../../commands/add.js';
import { detectProjectRoot } from '../../core/project.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { type FlatNode, flattenTree } from '../treeBrowse.js';

type Phase = 'home' | 'browse' | 'manual' | 'review' | 'done';

const VIEWPORT = 18;

function uniqSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

function manifestKey(node: { rel: string; isDir: boolean }): string {
  return node.isDir ? `${node.rel}/` : node.rel;
}

export function ScreenAdd() {
  const { db, cwd, currentProject, setScreen } = useTui();
  const projectRoot = useMemo(() => detectProjectRoot(cwd).root, [cwd]);

  const [phase, setPhase] = useState<Phase>('home');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [cursor, setCursor] = useState(0);
  const [reviewFrom, setReviewFrom] = useState<'browse' | 'manual'>('browse');
  const [manualVal, setManualVal] = useState('');
  const [pendingPaths, setPendingPaths] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const nodes = useMemo<FlatNode[]>(
    () => (phase === 'browse' ? flattenTree(projectRoot, expanded) : []),
    [phase, projectRoot, expanded],
  );

  useEffect(() => {
    if (phase !== 'browse') return;
    if (cursor > nodes.length - 1) setCursor(Math.max(0, nodes.length - 1));
  }, [phase, nodes.length, cursor]);

  useInput(
    (input, key) => {
      if (key.escape) {
        if (phase === 'home') setScreen('main');
        else if (phase === 'browse' || phase === 'manual') setPhase('home');
        else if (phase === 'review') setPhase(reviewFrom === 'browse' ? 'browse' : 'manual');
        else if (phase === 'done') setScreen('main');
        return;
      }
      if (phase !== 'browse' || nodes.length === 0) return;
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
        } else if (cur.parent) {
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
      if (key.return) {
        if (cur.isDir) {
          const next = new Set(expanded);
          if (next.has(cur.rel)) next.delete(cur.rel);
          else next.add(cur.rel);
          setExpanded(next);
        } else {
          toggleSelect(cur);
        }
        return;
      }
      if (input === ' ') {
        toggleSelect(cur);
        return;
      }
      if (input === 'c') {
        const arr = uniqSorted([...selected]);
        if (arr.length === 0) {
          setMsg('Nothing selected. Use space / enter on a file or directory first.');
          return;
        }
        setMsg(null);
        setPendingPaths(arr);
        setReviewFrom('browse');
        setPhase('review');
      }
    },
    { isActive: true },
  );

  function toggleSelect(n: { rel: string; isDir: boolean }): void {
    const key = manifestKey(n);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!currentProject) {
    return (
      <Box flexDirection="column">
        <Text color="red">Not in a project.</Text>
        <Footer hint="esc → main menu" />
      </Box>
    );
  }

  if (phase === 'done') {
    return (
      <Box flexDirection="column">
        <Text bold>add</Text>
        <Text color="green">{msg}</Text>
        <Footer hint="esc → main menu" />
      </Box>
    );
  }

  if (phase === 'home') {
    return (
      <Box flexDirection="column">
        <Text bold>add paths to manifest</Text>
        <Text dimColor>Project root: {projectRoot}</Text>
        <SelectInput
          items={[
            { label: 'Browse directory tree (multi-select)', value: 'browse' },
            { label: 'Enter paths manually (comma-separated)', value: 'manual' },
          ]}
          onSelect={(item) => {
            if (item.value === 'browse') {
              setCursor(0);
              setPhase('browse');
            } else setPhase('manual');
          }}
        />
        <Footer hint="esc → main menu" />
      </Box>
    );
  }

  if (phase === 'manual') {
    return (
      <Box flexDirection="column">
        <Text bold>manual paths (comma-separated)</Text>
        <Text dimColor>Examples: .cursor/, AGENTS.md, .env*</Text>
        <TextInput
          value={manualVal}
          onChange={setManualVal}
          onSubmit={(input) => {
            const paths = input
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            if (paths.length === 0) {
              setMsg('Enter at least one path.');
              return;
            }
            setMsg(null);
            setPendingPaths(uniqSorted(paths));
            setReviewFrom('manual');
            setPhase('review');
          }}
        />
        {msg && <Text color="yellow">{msg}</Text>}
        <Footer hint="enter submit · esc" />
      </Box>
    );
  }

  if (phase === 'review') {
    return (
      <Box flexDirection="column">
        <Text bold>confirm add to manifest</Text>
        <Text dimColor>{pendingPaths.length} path(s):</Text>
        {pendingPaths.map((p) => (
          <Text key={p}>+ {p}</Text>
        ))}
        {reviewError && <Text color="red">{reviewError}</Text>}
        <SelectInput
          items={[
            { label: 'Yes — add these paths', value: 'yes' },
            { label: 'No — go back', value: 'no' },
          ]}
          onSelect={async (item) => {
            if (item.value === 'no') {
              setReviewError(null);
              setPhase(reviewFrom === 'browse' ? 'browse' : 'manual');
              return;
            }
            setReviewError(null);
            try {
              const r = await add(db, currentProject.id, pendingPaths, { exclude: false });
              setMsg(`Added ${r.added.length} path(s) to manifest. Run save to snapshot files.`);
              setPhase('done');
            } catch (e) {
              setReviewError((e as Error).message);
            }
          }}
        />
        <Footer hint="esc → previous step" />
      </Box>
    );
  }

  // browse: VSCode-like file tree
  if (nodes.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>browse</Text>
        <Text color="yellow">Project root is empty (or unreadable).</Text>
        <Footer hint="esc → mode menu" />
      </Box>
    );
  }

  const start = Math.max(0, Math.min(nodes.length - VIEWPORT, cursor - Math.floor(VIEWPORT / 2)));
  const end = Math.min(nodes.length, start + VIEWPORT);
  const window = nodes.slice(start, end);
  const selectedCount = selected.size;

  return (
    <Box flexDirection="column">
      <Text bold>browse — file tree</Text>
      <Text dimColor>
        {projectRoot} · {selectedCount} selected · {cursor + 1}/{nodes.length}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {window.map((n, i) => {
          const idx = start + i;
          const focused = idx === cursor;
          const indent = '  '.repeat(n.depth);
          const chevron = n.isDir ? (expanded.has(n.rel) ? '▾' : '▸') : ' ';
          const checked = selected.has(manifestKey(n));
          const mark = checked ? '[x]' : '[ ]';
          const tail = n.isDir ? '/' : '';
          const line = `${focused ? '› ' : '  '}${indent}${chevron} ${mark} ${n.name}${tail}`;
          const color = focused ? 'cyan' : checked ? 'green' : undefined;
          return (
            <Text key={n.rel} bold={focused} color={color} dimColor={!focused && n.isDir}>
              {line}
            </Text>
          );
        })}
      </Box>
      {msg && <Text color="yellow">{msg}</Text>}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>↑↓ move · → expand · ← collapse/parent · enter open/toggle</Text>
        <Text dimColor>space toggle select · c continue · esc back</Text>
      </Box>
    </Box>
  );
}

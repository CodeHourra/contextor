import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { useEffect, useMemo, useState } from 'react';
import { add } from '../../commands/add.js';
import { rm } from '../../commands/rm.js';
import { listManifest } from '../../core/manifest.js';
import { detectProjectRoot } from '../../core/project.js';
import {
  DiskManifestTreeBrowse,
  manifestKeyForNode,
} from '../components/DiskManifestTreeBrowse.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';
import { type FlatNode, flattenTree } from '../treeBrowse.js';

type Phase = 'home' | 'browse' | 'manual' | 'review' | 'done';

function uniqSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

export type ManifestPathPickerMode = 'add' | 'rm';

export function ManifestPathPicker({ mode }: { mode: ManifestPathPickerMode }) {
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

  const manifestEntries = useMemo(
    () => (phase === 'browse' && currentProject ? listManifest(db, currentProject.id) : []),
    [db, currentProject, phase],
  );

  useEffect(() => {
    if (phase !== 'browse') return;
    if (cursor > nodes.length - 1) setCursor(Math.max(0, nodes.length - 1));
  }, [phase, nodes.length, cursor]);

  useInput(
    (input, key) => {
      if (!wantsEscapeLike(key, input)) return;
      if (phase === 'home') setScreen('main');
      else if (phase === 'manual') setPhase('home');
      else if (phase === 'review') setPhase(reviewFrom === 'browse' ? 'browse' : 'manual');
      else if (phase === 'done') setScreen('main');
    },
    { isActive: phase !== 'browse' },
  );

  function toggleSelect(n: { rel: string; isDir: boolean }): void {
    const k = manifestKeyForNode(n);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const screenTitle = mode === 'add' ? 'add' : 'rm';
  const homeTitle =
    mode === 'add' ? 'add paths to manifest' : 'remove paths from manifest (browse or manual)';
  const reviewTitle = mode === 'add' ? 'confirm add to manifest' : 'confirm remove from manifest';
  const reviewYes = mode === 'add' ? 'Yes — add these paths' : 'Yes — remove these manifest paths';

  if (!currentProject) {
    return (
      <Box flexDirection="column">
        <Text color="red">Not in a project.</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
      </Box>
    );
  }

  if (phase === 'done') {
    return (
      <Box flexDirection="column">
        <Text bold>{screenTitle}</Text>
        <Text color="green">{msg}</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
      </Box>
    );
  }

  if (phase === 'home') {
    return (
      <Box flexDirection="column">
        <Text bold>{homeTitle}</Text>
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
        <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
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
        <Footer hint={`enter submit · ${ESCAPE_LIKE_HINT}`} />
      </Box>
    );
  }

  if (phase === 'review') {
    const prefix = mode === 'add' ? '+' : '−';
    return (
      <Box flexDirection="column">
        <Text bold>{reviewTitle}</Text>
        <Text dimColor>{pendingPaths.length} path(s):</Text>
        {pendingPaths.map((p) => (
          <Text key={p}>
            {prefix} {p}
          </Text>
        ))}
        {reviewError && <Text color="red">{reviewError}</Text>}
        <SelectInput
          items={[
            { label: reviewYes, value: 'yes' },
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
              if (mode === 'add') {
                const r = await add(db, currentProject.id, pendingPaths, { exclude: false });
                setMsg(`Added ${r.added.length} path(s) to manifest. Run save to snapshot files.`);
              } else {
                const r = await rm(db, currentProject.id, pendingPaths);
                setMsg(`Removed ${r.removed} manifest row(s).`);
              }
              setPhase('done');
            } catch (e) {
              setReviewError((e as Error).message);
            }
          }}
        />
        <Footer hint={`${ESCAPE_LIKE_HINT} → previous step`} />
      </Box>
    );
  }

  if (phase === 'browse') {
    return (
      <DiskManifestTreeBrowse
        projectRoot={projectRoot}
        manifestEntries={manifestEntries}
        nodes={nodes}
        expanded={expanded}
        setExpanded={setExpanded}
        cursor={cursor}
        setCursor={setCursor}
        title="browse — file tree"
        pick={{
          selected,
          selectedCount: selected.size,
          msg,
          onToggleSelect: toggleSelect,
          onInvertListed: () => {
            setSelected((s) => {
              const next = new Set(s);
              for (const n of nodes) {
                const k = manifestKeyForNode(n);
                if (next.has(k)) next.delete(k);
                else next.add(k);
              }
              return next;
            });
            setMsg(null);
          },
          onSelectAllListed: () => {
            setSelected((s) => {
              const next = new Set(s);
              for (const n of nodes) next.add(manifestKeyForNode(n));
              return next;
            });
            setMsg(null);
          },
          onClearListed: () => {
            setSelected((s) => {
              const next = new Set(s);
              for (const n of nodes) next.delete(manifestKeyForNode(n));
              return next;
            });
            setMsg(null);
          },
          onContinue: () => {
            const arr = uniqSorted([...selected]);
            if (arr.length === 0) {
              setMsg('Nothing selected. Use space / enter on a file or directory first.');
              return;
            }
            setMsg(null);
            setPendingPaths(arr);
            setReviewFrom('browse');
            setPhase('review');
          },
        }}
        onBrowseEscape={() => setPhase('home')}
        backTarget="mode menu"
      />
    );
  }

  throw new Error(`unexpected phase: ${String(phase)}`);
}

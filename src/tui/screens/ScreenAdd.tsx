import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { useMemo, useState } from 'react';
import { add } from '../../commands/add.js';
import { detectProjectRoot } from '../../core/project.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { listProjectDir, parentRel } from '../treeBrowse.js';

type Phase = 'home' | 'browse' | 'manual' | 'review' | 'done';

function uniqSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

export function ScreenAdd() {
  const { db, cwd, currentProject, setScreen } = useTui();
  const projectRoot = useMemo(() => detectProjectRoot(cwd).root, [cwd]);

  const [phase, setPhase] = useState<Phase>('home');
  const [browseRel, setBrowseRel] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewFrom, setReviewFrom] = useState<'browse' | 'manual'>('browse');
  const [manualVal, setManualVal] = useState('');
  const [pendingPaths, setPendingPaths] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useInput((_, k) => {
    if (!k.escape) return;
    if (phase === 'home') setScreen('main');
    else if (phase === 'browse') setPhase('home');
    else if (phase === 'manual') setPhase('home');
    else if (phase === 'review') setPhase(reviewFrom === 'browse' ? 'browse' : 'manual');
    else if (phase === 'done') setScreen('main');
  });

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
              setBrowseRel('');
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

  // browse
  let entries: ReturnType<typeof listProjectDir>;
  try {
    entries = listProjectDir(projectRoot, browseRel);
  } catch {
    return (
      <Box flexDirection="column">
        <Text color="red">Cannot read directory.</Text>
        <Footer hint="esc" />
      </Box>
    );
  }

  const items: Array<{ label: string; value: string }> = [];
  if (browseRel) {
    items.push({ label: '.. (parent directory)', value: '__UP__' });
  }
  for (const e of entries) {
    if (e.isDir) {
      items.push({ label: `[dir] ${e.name}/  → enter`, value: `__ENTER__:${e.rel}` });
      items.push({
        label: `[dir] ${e.name}/  → add whole folder to selection`,
        value: `__ADD_DIR__:${e.rel}`,
      });
    } else {
      items.push({
        label: `[file] ${e.name}  → toggle in selection`,
        value: `__TOGGLE__:${e.rel}`,
      });
    }
  }
  items.push({ label: '── Finish selection → confirm', value: '__DONE__' });

  const selectedPreview =
    selected.length === 0
      ? '(none)'
      : selected.length <= 4
        ? selected.join(', ')
        : `${selected.slice(0, 3).join(', ')} … +${selected.length - 3}`;

  return (
    <Box flexDirection="column">
      <Text bold>browse manifest paths</Text>
      <Text dimColor>
        Current: {browseRel || '.'} · selected {selected.length}: {selectedPreview}
      </Text>
      <SelectInput
        items={items}
        onSelect={(item) => {
          const v = item.value;
          if (v === '__UP__') {
            setBrowseRel(parentRel(browseRel));
            return;
          }
          if (v.startsWith('__ENTER__:')) {
            setBrowseRel(v.slice('__ENTER__:'.length));
            return;
          }
          if (v.startsWith('__ADD_DIR__:')) {
            const rel = v.slice('__ADD_DIR__:'.length);
            const manifestPath = rel.endsWith('/') ? rel : `${rel}/`;
            setSelected((prev) => (prev.includes(manifestPath) ? prev : [...prev, manifestPath]));
            return;
          }
          if (v.startsWith('__TOGGLE__:')) {
            const rel = v.slice('__TOGGLE__:'.length);
            setSelected((prev) =>
              prev.includes(rel) ? prev.filter((p) => p !== rel) : [...prev, rel],
            );
            return;
          }
          if (v === '__DONE__') {
            if (selected.length === 0) {
              setMsg('Select at least one file or folder (use toggle / add whole folder).');
              return;
            }
            setMsg(null);
            setPendingPaths(uniqSorted(selected));
            setReviewFrom('browse');
            setPhase('review');
          }
        }}
      />
      {msg && <Text color="yellow">{msg}</Text>}
      <Footer hint="esc → mode menu" />
    </Box>
  );
}

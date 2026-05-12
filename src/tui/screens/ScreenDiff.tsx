import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { useEffect, useMemo, useState } from 'react';
import { diff } from '../../commands/diff.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';

export function ScreenDiff() {
  const { db, cwd, currentProject, setScreen } = useTui();
  const [paths, setPaths] = useState<string[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [patch, setPatch] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useInput((input, k) => {
    if (wantsEscapeLike(k, input)) {
      if (pick) {
        setPick(null);
        setPatch('');
      } else setScreen('main');
    }
  });

  useEffect(() => {
    if (!currentProject) return;
    const rows = db
      .prepare('SELECT path FROM managed_files WHERE project_id = ? AND is_dir = 0 ORDER BY path')
      .all(currentProject.id) as { path: string }[];
    setPaths(rows.map((r) => r.path));
    if (rows.length === 0) setErr('No managed files.');
  }, [db, currentProject]);

  const items = useMemo(() => paths.map((p) => ({ label: p, value: p })), [paths]);

  if (!currentProject) {
    return (
      <Box flexDirection="column">
        <Text color="red">Not in a project.</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
      </Box>
    );
  }

  if (pick) {
    const lines = patch.split('\n').slice(0, 36);
    return (
      <Box flexDirection="column">
        <Text bold>diff {pick}</Text>
        {lines.map((l, lineNo) => (
          <Text key={`${pick}:${String(lineNo)}:${l}`}>{l}</Text>
        ))}
        <Footer hint={`${ESCAPE_LIKE_HINT} → file list`} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>diff — choose file</Text>
      {err ? (
        <Text color="red">{err}</Text>
      ) : (
        <SelectInput
          items={items}
          onSelect={(it) => {
            try {
              setPatch(diff(db, currentProject.id, cwd, it.value as string));
              setPick(it.value as string);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        />
      )}
      <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
    </Box>
  );
}

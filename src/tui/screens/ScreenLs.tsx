import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { ls } from '../../commands/ls.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';

export function ScreenLs() {
  const { db, currentProject, setScreen } = useTui();
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<string[]>([]);
  useInput((input, k) => wantsEscapeLike(k, input) && setScreen('main'));

  useEffect(() => {
    if (!currentProject) {
      setErr('Not in a project.');
      return;
    }
    ls(db, currentProject.id)
      .then((entries) =>
        setRows(entries.map((e) => `${e.kind === 'exclude' ? '!' : '+'} ${e.path}`)),
      )
      .catch((e) => setErr((e as Error).message));
  }, [db, currentProject]);

  return (
    <Box flexDirection="column">
      <Text bold>ls (manifest)</Text>
      {err ? <Text color="red">{err}</Text> : rows.map((l) => <Text key={l}>{l}</Text>)}
      <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
    </Box>
  );
}

import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { status } from '../../commands/status.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';

export function ScreenStatus() {
  const { db, cwd, currentProject, setScreen } = useTui();
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  useInput((input, k) => wantsEscapeLike(k, input) && setScreen('main'));

  useEffect(() => {
    if (!currentProject) {
      setErr('Not in a project (init or link first).');
      return;
    }
    try {
      const c = status(db, currentProject.id, cwd);
      const out: string[] = [];
      for (const p of c.created) out.push(`+ ${p}`);
      for (const p of c.changed) out.push(`~ ${p}`);
      for (const p of c.untracked) out.push(`? ${p}`);
      for (const p of c.unchanged) out.push(`  ${p}`);
      setLines(out);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [db, cwd, currentProject]);

  return (
    <Box flexDirection="column">
      <Text bold>status</Text>
      {err ? <Text color="red">{err}</Text> : lines.map((l) => <Text key={l}>{l}</Text>)}
      <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
    </Box>
  );
}

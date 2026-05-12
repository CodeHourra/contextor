import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { type ProjectSummary, projects } from '../../commands/projects.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';

export function ScreenProjects() {
  const { db, setScreen } = useTui();
  const [rows, setRows] = useState<ProjectSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useInput((_, k) => k.escape && setScreen('main'));

  useEffect(() => {
    projects(db)
      .then(setRows)
      .catch((e) => setErr((e as Error).message));
  }, [db]);

  return (
    <Box flexDirection="column">
      <Text bold>projects</Text>
      {err && <Text color="red">{err}</Text>}
      {rows.map((p) => (
        <Text key={p.id}>
          {p.alias} · files={p.fileCount} · {p.remote_url ?? 'no remote'}
        </Text>
      ))}
      <Footer hint="esc → main menu" />
    </Box>
  );
}

import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { rm } from '../../commands/rm.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';

export function ScreenRm() {
  const { db, currentProject, setScreen } = useTui();
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useInput((_, k) => k.escape && setScreen('main'));

  if (!currentProject) {
    return (
      <Box flexDirection="column">
        <Text color="red">Not in a project.</Text>
        <Footer hint="esc → main menu" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>rm manifest paths (comma-separated)</Text>
      <TextInput
        value={val}
        onChange={setVal}
        onSubmit={async (input) => {
          const paths = input
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          try {
            const r = await rm(db, currentProject.id, paths);
            setMsg(`Removed ${r.removed} row(s).`);
          } catch (e) {
            setMsg(`Error: ${(e as Error).message}`);
          }
        }}
      />
      {msg && <Text color="cyan">{msg}</Text>}
      <Footer hint="enter submit · esc" />
    </Box>
  );
}

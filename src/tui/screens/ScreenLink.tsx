import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { link } from '../../commands/link.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';

export function ScreenLink() {
  const { db, cwd, setScreen } = useTui();
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useInput((_, k) => k.escape && setScreen('main'));

  return (
    <Box flexDirection="column">
      <Text bold>link cwd → project alias</Text>
      <TextInput
        value={val}
        onChange={setVal}
        onSubmit={async (alias) => {
          try {
            const p = await link(db, alias.trim(), cwd);
            setMsg(`Linked cwd to ${p.alias}.`);
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

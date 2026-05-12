import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { rename } from '../../commands/rename.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';

export function ScreenRename() {
  const { db, setScreen } = useTui();
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useInput((input, k) => wantsEscapeLike(k, input) && setScreen('main'));

  return (
    <Box flexDirection="column">
      <Text bold>rename project: oldAlias,newAlias</Text>
      <TextInput
        value={val}
        onChange={setVal}
        onSubmit={async (line) => {
          const [a, b] = line.split(',').map((s) => s.trim());
          if (!a || !b) {
            setMsg('Need two comma-separated aliases.');
            return;
          }
          try {
            await rename(db, a, b);
            setMsg(`Renamed ${a} → ${b}.`);
          } catch (e) {
            setMsg(`Error: ${(e as Error).message}`);
          }
        }}
      />
      {msg && <Text color="cyan">{msg}</Text>}
      <Footer hint={`enter submit · ${ESCAPE_LIKE_HINT}`} />
    </Box>
  );
}

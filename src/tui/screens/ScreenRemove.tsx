import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useMemo, useState } from 'react';
import { remove } from '../../commands/remove.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';
import {
  ReporterShell,
  type TuiReporterState,
  createInitialReporterState,
  tuiReporter,
} from '../reporter.js';

export function ScreenRemove() {
  const { db, setScreen } = useTui();
  const [rs, setRs] = useState<TuiReporterState>(createInitialReporterState);
  const reporter = useMemo(() => tuiReporter(setRs), []);
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useInput((input, k) => wantsEscapeLike(k, input) && setScreen('main'));

  return (
    <Box flexDirection="column">
      <Text bold>remove project (alias)</Text>
      <ReporterShell state={rs} setState={setRs} />
      <TextInput
        value={val}
        onChange={setVal}
        onSubmit={async (alias) => {
          try {
            const r = await remove(db, alias.trim(), { yes: false }, reporter);
            setMsg(r.removed ? `Removed ${r.alias}.` : 'Cancelled.');
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

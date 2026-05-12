import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { save } from '../../commands/save.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';
import {
  ReporterShell,
  type TuiReporterState,
  createInitialReporterState,
  tuiReporter,
} from '../reporter.js';

export function ScreenSave() {
  const { db, cwd, setScreen } = useTui();
  const [rs, setRs] = useState<TuiReporterState>(createInitialReporterState);
  const reporter = useMemo(() => tuiReporter(setRs), []);
  const [end, setEnd] = useState<{ ok: boolean; text: string } | null>(null);

  useInput((input, k) => {
    if (wantsEscapeLike(k, input)) setScreen('main');
    else if (end && !rs.interaction) setScreen('main');
  });

  useEffect(() => {
    let cancelled = false;
    save(db, { cwd, allowLarge: false, dryRun: false }, reporter)
      .then((r) => {
        if (cancelled) return;
        const text =
          r.added === 0 && r.updated === 0 && r.removed === 0
            ? 'No changes.'
            : `+${r.added} ~${r.updated} -${r.removed}`;
        setEnd({ ok: true, text });
      })
      .catch((e: Error) => {
        if (!cancelled) setEnd({ ok: false, text: e?.message ?? String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [db, cwd, reporter]);

  return (
    <Box flexDirection="column">
      <Text bold>save</Text>
      <ReporterShell state={rs} setState={setRs} />
      {end && (
        <Box marginTop={1} flexDirection="column">
          <Text color={end.ok ? 'green' : 'red'}>
            {end.ok ? '✓ ' : '✗ '}
            {end.text}
          </Text>
          <Text dimColor>any key · {ESCAPE_LIKE_HINT} → menu</Text>
        </Box>
      )}
      {!end && <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />}
    </Box>
  );
}

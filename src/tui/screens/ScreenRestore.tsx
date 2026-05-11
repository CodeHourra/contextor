import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { restore } from '../../commands/restore.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import {
  ReporterShell,
  type TuiReporterState,
  createInitialReporterState,
  tuiReporter,
} from '../reporter.js';

export function ScreenRestore() {
  const { db, cwd, setScreen } = useTui();
  const [rs, setRs] = useState<TuiReporterState>(createInitialReporterState);
  const reporter = useMemo(() => tuiReporter(setRs), []);
  const [end, setEnd] = useState<{ ok: boolean; text: string } | null>(null);

  useInput((_i, k) => {
    if (k.escape) setScreen('main');
    else if (end && !rs.interaction) setScreen('main');
  });

  useEffect(() => {
    let cancelled = false;
    restore(db, { cwd, yes: false, noBackup: false, dryRun: false }, reporter)
      .then((r) => {
        if (cancelled) return;
        setEnd({
          ok: true,
          text: `restored=${r.restored} created=${r.created.length} changed=${r.changed.length}`,
        });
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
      <Text bold>restore</Text>
      <ReporterShell state={rs} setState={setRs} />
      {end && (
        <Box marginTop={1} flexDirection="column">
          <Text color={end.ok ? 'green' : 'red'}>
            {end.ok ? '✓ ' : '✗ '}
            {end.text}
          </Text>
          <Text dimColor>any key · esc → menu</Text>
        </Box>
      )}
      {!end && <Footer hint="esc → main menu" />}
    </Box>
  );
}

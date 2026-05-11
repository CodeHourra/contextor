import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { init } from '../../commands/init.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import {
  ReporterShell,
  type TuiReporterState,
  createInitialReporterState,
  tuiReporter,
} from '../reporter.js';

type End = { ok: true; text: string } | { ok: false; text: string };

export function ScreenInit() {
  const { db, cwd, setScreen, refreshProject } = useTui();
  const [rs, setRs] = useState<TuiReporterState>(createInitialReporterState);
  const reporter = useMemo(() => tuiReporter(setRs), []);
  const [end, setEnd] = useState<End | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      setScreen('main');
      return;
    }
    if (end && !rs.interaction) setScreen('main');
  });

  useEffect(() => {
    let cancelled = false;
    init(db, { cwd, noScan: false, yes: true }, reporter)
      .then((r) => {
        if (cancelled) return;
        refreshProject();
        const text = r.linked
          ? `Linked to ${r.project.alias}`
          : `Created ${r.project.alias}, saved ${r.saved} files.`;
        setEnd({ ok: true, text });
      })
      .catch((e: Error) => {
        if (!cancelled) setEnd({ ok: false, text: e?.message ?? String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [db, cwd, reporter, refreshProject]);

  return (
    <Box flexDirection="column">
      <Text bold>init</Text>
      <ReporterShell state={rs} setState={setRs} />
      {end && (
        <Box marginTop={1} flexDirection="column">
          <Text color={end.ok ? 'green' : 'red'}>
            {end.ok ? '✓ ' : '✗ '}
            {end.text}
          </Text>
          <Text dimColor>any key to menu · esc</Text>
        </Box>
      )}
      {!end && <Footer hint="esc → main menu" />}
    </Box>
  );
}

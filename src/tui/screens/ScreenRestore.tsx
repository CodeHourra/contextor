import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { restore } from '../../commands/restore.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';
import {
  ReporterShell,
  type TuiReporterState,
  createInitialReporterState,
  tuiReporter,
} from '../reporter.js';

export function ScreenRestore() {
  const { db, cwd, currentProject, setScreen } = useTui();
  const [rs, setRs] = useState<TuiReporterState>(createInitialReporterState);
  const reporter = useMemo(() => tuiReporter(setRs), []);
  const [end, setEnd] = useState<{ ok: boolean; text: string } | null>(null);

  useInput((input, k) => {
    if (wantsEscapeLike(k, input)) setScreen('main');
    else if (end && !rs.interaction) setScreen('main');
  });

  useEffect(() => {
    if (!currentProject) return;
    let cancelled = false;
    restore(
      db,
      {
        cwd,
        projectId: currentProject.id,
        yes: false,
        noBackup: false,
        dryRun: false,
      },
      reporter,
    )
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
  }, [db, cwd, currentProject, reporter]);

  if (!currentProject) {
    return (
      <Box flexDirection="column">
        <Text color="red">Not in a project. Run init or link this directory before restore.</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
      </Box>
    );
  }

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
          <Text dimColor>any key · {ESCAPE_LIKE_HINT} → menu</Text>
        </Box>
      )}
      {!end && <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />}
    </Box>
  );
}

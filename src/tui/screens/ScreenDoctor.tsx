import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { type DoctorReport, doctor } from '../../commands/doctor.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';
import {
  ReporterShell,
  type TuiReporterState,
  createInitialReporterState,
  tuiReporter,
} from '../reporter.js';

export function ScreenDoctor() {
  const { db, cwd, setScreen } = useTui();
  const [rs, setRs] = useState<TuiReporterState>(createInitialReporterState);
  const reporter = useMemo(() => tuiReporter(setRs), []);
  const [rep, setRep] = useState<DoctorReport | null>(null);
  useInput((input, k) => wantsEscapeLike(k, input) && setScreen('main'));

  useEffect(() => {
    doctor(db, cwd, reporter).then(setRep);
  }, [db, cwd, reporter]);

  return (
    <Box flexDirection="column">
      <Text bold>doctor</Text>
      <ReporterShell state={rs} setState={setRs} />
      {rep && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={rep.ok ? 'green' : 'red'}>{rep.ok ? 'OK' : 'ISSUES'}</Text>
          {rep.issues.map((s) => (
            <Text key={s} color="red">
              {s}
            </Text>
          ))}
          {rep.warnings.map((s) => (
            <Text key={s} color="yellow">
              {s}
            </Text>
          ))}
        </Box>
      )}
      <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
    </Box>
  );
}

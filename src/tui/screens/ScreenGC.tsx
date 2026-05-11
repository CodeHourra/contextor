import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { gc, vacuum } from '../../commands/gc.js';
import { DB_PATH } from '../../utils/home.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';

export function ScreenGC() {
  const { db, setScreen } = useTui();
  const [msg, setMsg] = useState<string | null>(null);
  useInput((_, k) => k.escape && setScreen('main'));

  useEffect(() => {
    const n = gc(db);
    const v = vacuum(db, DB_PATH);
    setMsg(`orphan blobs removed: ${n}; db ${v.before} → ${v.after} bytes`);
  }, [db]);

  return (
    <Box flexDirection="column">
      <Text bold>gc + vacuum</Text>
      {msg && <Text color="cyan">{msg}</Text>}
      <Footer hint="esc → main menu" />
    </Box>
  );
}

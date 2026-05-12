import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { type TrashListEntry, listTrash } from '../../commands/trash.js';
import { TRASH_DIR } from '../../utils/home.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';

export function ScreenTrash() {
  const { setScreen } = useTui();
  const [rows, setRows] = useState<TrashListEntry[]>([]);
  useInput((input, k) => wantsEscapeLike(k, input) && setScreen('main'));

  useEffect(() => {
    setRows(listTrash(TRASH_DIR));
  }, []);

  return (
    <Box flexDirection="column">
      <Text bold>trash</Text>
      {rows.length === 0 ? (
        <Text dimColor>(empty)</Text>
      ) : (
        rows.map((e) => (
          <Text key={e.id}>
            {e.id} ({e.files.length} files)
          </Text>
        ))
      )}
      <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
    </Box>
  );
}

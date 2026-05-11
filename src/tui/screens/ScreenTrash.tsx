import { Box, Text, useInput } from 'ink';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';

export function ScreenTrash() {
  const { setScreen } = useTui();
  useInput((_i, k) => {
    if (k.escape) setScreen('main');
  });
  return (
    <Box flexDirection="column">
      <Text>Screen Trash (TODO)</Text>
      <Footer hint="press ESC to back" />
    </Box>
  );
}

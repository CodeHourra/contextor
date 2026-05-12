import { Box, Text } from 'ink';

type FooterProps = {
  hint?: string;
};

export function Footer({ hint }: FooterProps) {
  if (!hint) return null;
  return (
    <Box marginTop={1}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}

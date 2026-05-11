import { Box, Text } from 'ink';

type HeaderProps = {
  title?: string;
  subtitle?: string;
};

export function Header({ title = 'contextor', subtitle }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{title}</Text>
      {subtitle ? <Text dimColor>{subtitle}</Text> : null}
    </Box>
  );
}

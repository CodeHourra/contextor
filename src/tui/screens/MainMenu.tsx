import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { Header } from '../components/Header.js';
import { useTui } from '../context.js';
import type { ScreenName } from '../types.js';
import { ALL_ITEMS, PROJECT_BOUND } from './mainMenuConfig.js';

export function MainMenu() {
  const { currentProject, setScreen } = useTui();
  const { exit } = useApp();
  const inProject = currentProject != null;

  useInput((input) => {
    if (input === 'q') exit();
  });

  const items = ALL_ITEMS.filter((it) => {
    const v = it.value;
    if (v === '__sep__' || v === 'quit') return true;
    if (PROJECT_BOUND.has(v as ScreenName)) return inProject;
    return true;
  }).filter((it, i, arr) => {
    if (it.value !== '__sep__') return true;
    const prev = arr[i - 1]?.value;
    const next = arr[i + 1]?.value;
    if (prev === '__sep__' || next === '__sep__') return false;
    return i > 0 && i < arr.length - 1;
  });

  return (
    <Box flexDirection="column">
      <Header />
      {inProject ? (
        <Text dimColor>
          Current project: {currentProject.alias}
          {currentProject.remote_url ? ` (origin: ${currentProject.remote_url})` : ''}
        </Text>
      ) : (
        <Text dimColor>{"Not in a project. Try 'init' or 'cd' to a project."}</Text>
      )}
      <Text dimColor>───────────────────────────────</Text>
      <SelectInput
        items={[...items]}
        onSelect={(item) => {
          if (item.value === 'quit') exit();
          else if (item.value !== '__sep__') setScreen(item.value as ScreenName);
        }}
      />
    </Box>
  );
}

import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { type Rule, listRules } from '../../commands/rules.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';

export function ScreenRules() {
  const { db, setScreen } = useTui();
  const [rules, setRules] = useState<Rule[]>([]);
  useInput((_, k) => k.escape && setScreen('main'));

  useEffect(() => {
    setRules(listRules(db));
  }, [db]);

  return (
    <Box flexDirection="column">
      <Text bold>global rules</Text>
      {rules.map((r) => (
        <Text key={r.id}>
          {r.isDefault ? '*' : '·'} {r.pattern}
        </Text>
      ))}
      <Footer hint="esc → main menu" />
    </Box>
  );
}

import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { type Rule, listRules } from '../../commands/rules.js';
import { Footer } from '../components/Footer.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';

export function ScreenRules() {
  const { db, setScreen } = useTui();
  const [rules, setRules] = useState<Rule[]>([]);
  useInput((input, k) => wantsEscapeLike(k, input) && setScreen('main'));

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
      <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
    </Box>
  );
}

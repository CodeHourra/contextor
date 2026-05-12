import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { ls } from '../../commands/ls.js';
import type { ManifestEntry } from '../../core/manifest.js';
import { Footer } from '../components/Footer.js';
import { ManifestEntryTreeBrowse } from '../components/ManifestEntryTreeBrowse.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';

export function ScreenLs() {
  const { db, currentProject, setScreen } = useTui();
  const [err, setErr] = useState<string | null>(null);
  const [entries, setEntries] = useState<ManifestEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useInput(
    (input, k) => {
      if (!currentProject || err || loading) {
        if (wantsEscapeLike(k, input)) setScreen('main');
      }
    },
    { isActive: !currentProject || !!err || loading },
  );

  useEffect(() => {
    if (!currentProject) {
      setErr('Not in a project.');
      setEntries([]);
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    ls(db, currentProject.id)
      .then((e) => {
        setEntries(e);
        setLoading(false);
      })
      .catch((e: Error) => {
        setErr(e.message);
        setEntries([]);
        setLoading(false);
      });
  }, [db, currentProject]);

  if (!currentProject) {
    return (
      <Box flexDirection="column">
        <Text bold>ls (manifest)</Text>
        <Text color="red">{err}</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
      </Box>
    );
  }

  if (err) {
    return (
      <Box flexDirection="column">
        <Text bold>ls (manifest)</Text>
        <Text color="red">{err}</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text bold>ls (manifest)</Text>
        <Text dimColor>Loading manifest…</Text>
        <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
      </Box>
    );
  }

  return (
    <ManifestEntryTreeBrowse
      entries={entries}
      title="ls (manifest)"
      subtitles={[`Project: ${currentProject.alias}`]}
      onBack={() => setScreen('main')}
      backTarget="main menu"
    />
  );
}

import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { useEffect, useState } from 'react';
import { type ProjectSummary, projects } from '../../commands/projects.js';
import type { ManifestEntry } from '../../core/manifest.js';
import { listManifest } from '../../core/manifest.js';
import { Footer } from '../components/Footer.js';
import { ManifestEntryTreeBrowse } from '../components/ManifestEntryTreeBrowse.js';
import { useTui } from '../context.js';
import { ESCAPE_LIKE_HINT, wantsEscapeLike } from '../escapeLike.js';

type Phase = 'list' | 'detail';

export function ScreenProjects() {
  const { db, setScreen } = useTui();
  const [phase, setPhase] = useState<Phase>('list');
  const [rows, setRows] = useState<ProjectSummary[]>([]);
  const [detail, setDetail] = useState<ProjectSummary | null>(null);
  const [entries, setEntries] = useState<ManifestEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useInput(
    (input, k) => {
      if (phase === 'list' && wantsEscapeLike(k, input)) setScreen('main');
    },
    { isActive: phase === 'list' },
  );

  useEffect(() => {
    projects(db)
      .then(setRows)
      .catch((e: Error) => setErr(e.message));
  }, [db]);

  useEffect(() => {
    if (phase !== 'detail' || !detail) {
      setEntries([]);
      return;
    }
    setEntries(listManifest(db, detail.id));
  }, [phase, detail, db]);

  if (phase === 'detail' && detail) {
    const lastSaved =
      detail.lastSavedAt != null ? new Date(detail.lastSavedAt).toISOString() : 'never';
    return (
      <ManifestEntryTreeBrowse
        entries={entries}
        title={`project: ${detail.alias}`}
        subtitles={[
          `files in snapshot: ${detail.fileCount}`,
          `last save: ${lastSaved}`,
          detail.remote_url ? `remote: ${detail.remote_url}` : 'remote: (none)',
        ]}
        onBack={() => {
          setDetail(null);
          setPhase('list');
        }}
        backTarget="project list"
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>projects</Text>
      <Text dimColor>Enter: open manifest tree · {ESCAPE_LIKE_HINT} → main menu</Text>
      {err && <Text color="red">{err}</Text>}
      {!err && rows.length === 0 && <Text dimColor>No projects in database.</Text>}
      {!err && rows.length > 0 && (
        <SelectInput
          items={rows.map((p) => ({
            label: `${p.alias} · ${p.fileCount} files · ${p.remote_url ?? 'no remote'}`,
            value: String(p.id),
          }))}
          onSelect={(item) => {
            const id = Number.parseInt(String(item.value), 10);
            const p = rows.find((r) => r.id === id);
            if (p) {
              setDetail(p);
              setPhase('detail');
            }
          }}
        />
      )}
      <Footer hint={`${ESCAPE_LIKE_HINT} → main menu`} />
    </Box>
  );
}

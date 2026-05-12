import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { type Dispatch, type SetStateAction, useMemo, useState } from 'react';
import type { Reporter } from '../commands/types.js';

const SUBMIT_VALUE = '__contextor_submit__';

export type LogLine = {
  id: number;
  kind: 'info' | 'warn' | 'success' | 'error';
  text: string;
};

type InteractionBase = { id: number };

export type ReporterInteraction =
  | (InteractionBase & {
      type: 'confirm';
      message: string;
      resolve: (v: boolean) => void;
    })
  | (InteractionBase & {
      type: 'prompt';
      message: string;
      defaultValue?: string;
      resolve: (v: string) => void;
    })
  | (InteractionBase & {
      type: 'selectOne';
      message: string;
      choices: { label: string; value: unknown }[];
      resolve: (v: unknown) => void;
    })
  | (InteractionBase & {
      type: 'multiSelect';
      message: string;
      choices: { label: string; value: unknown; checked?: boolean }[];
      resolve: (v: unknown[]) => void;
    });

export type TuiReporterState = {
  nextLogId: number;
  nextIxId: number;
  logs: LogLine[];
  progress: { stage: string; current: number; total: number } | null;
  interaction: ReporterInteraction | null;
};

export function createInitialReporterState(): TuiReporterState {
  return {
    nextLogId: 0,
    nextIxId: 0,
    logs: [],
    progress: null,
    interaction: null,
  };
}

function pushInteraction(
  setState: Dispatch<SetStateAction<TuiReporterState>>,
  build: (id: number) => ReporterInteraction,
): void {
  setState((s) => {
    const id = s.nextIxId;
    return {
      ...s,
      nextIxId: id + 1,
      interaction: build(id),
    };
  });
}

export function tuiReporter(setState: Dispatch<SetStateAction<TuiReporterState>>): Reporter {
  const log =
    (kind: LogLine['kind']) =>
    (message: string): void => {
      setState((s) => {
        const id = s.nextLogId;
        return {
          ...s,
          nextLogId: id + 1,
          logs: [...s.logs, { id, kind, text: message }],
        };
      });
    };

  return {
    info: log('info'),
    warn: log('warn'),
    success: log('success'),
    error: log('error'),
    confirm(message) {
      return new Promise((resolve) => {
        pushInteraction(setState, (id) => ({
          id,
          type: 'confirm',
          message,
          resolve,
        }));
      });
    },
    prompt(message, defaultValue) {
      return new Promise((resolve) => {
        pushInteraction(setState, (id) => ({
          id,
          type: 'prompt',
          message,
          defaultValue,
          resolve,
        }));
      });
    },
    selectOne(promptText, choices) {
      return new Promise((resolve) => {
        pushInteraction(setState, (id) => ({
          id,
          type: 'selectOne',
          message: promptText,
          choices: choices.map((c) => ({ label: c.label, value: c.value })),
          resolve,
        }));
      }) as ReturnType<Reporter['selectOne']>;
    },
    multiSelect(promptText, choices) {
      return new Promise((resolve) => {
        pushInteraction(setState, (id) => ({
          id,
          type: 'multiSelect',
          message: promptText,
          choices: choices.map((c) => ({
            label: c.label,
            value: c.value,
            checked: c.checked,
          })),
          resolve,
        }));
      }) as ReturnType<Reporter['multiSelect']>;
    },
    progress: (stage, current, total) => {
      setState((s) => ({ ...s, progress: { stage, current, total } }));
    },
  };
}

function clearInteraction(setState: Dispatch<SetStateAction<TuiReporterState>>): void {
  setState((s) => ({ ...s, interaction: null }));
}

function ConfirmIx({
  ix,
  setState,
}: {
  ix: Extract<ReporterInteraction, { type: 'confirm' }>;
  setState: Dispatch<SetStateAction<TuiReporterState>>;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{ix.message}</Text>
      <SelectInput
        items={[
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ]}
        onSelect={(item) => {
          ix.resolve(item.value);
          clearInteraction(setState);
        }}
      />
    </Box>
  );
}

function PromptIx({
  ix,
  setState,
}: {
  ix: Extract<ReporterInteraction, { type: 'prompt' }>;
  setState: Dispatch<SetStateAction<TuiReporterState>>;
}) {
  const [value, setValue] = useState(ix.defaultValue ?? '');
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{ix.message}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(v) => {
          ix.resolve(v);
          clearInteraction(setState);
        }}
      />
    </Box>
  );
}

function SelectOneIx({
  ix,
  setState,
}: {
  ix: Extract<ReporterInteraction, { type: 'selectOne' }>;
  setState: Dispatch<SetStateAction<TuiReporterState>>;
}) {
  const items = useMemo(
    () => ix.choices.map((c) => ({ label: c.label, value: c.value })),
    [ix.choices],
  );
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{ix.message}</Text>
      <SelectInput
        items={items}
        onSelect={(item) => {
          ix.resolve(item.value);
          clearInteraction(setState);
        }}
      />
    </Box>
  );
}

function MultiSelectIx({
  ix,
  setState,
}: {
  ix: Extract<ReporterInteraction, { type: 'multiSelect' }>;
  setState: Dispatch<SetStateAction<TuiReporterState>>;
}) {
  const [rows, setRows] = useState(() =>
    ix.choices.map((c) => ({
      label: c.label,
      value: c.value,
      checked: c.checked ?? false,
    })),
  );

  const items = useMemo(
    () => [
      ...rows.map((r, i) => ({
        label: `${r.checked ? '[x]' : '[ ]'} ${r.label}`,
        value: i as number | string,
      })),
      { label: '── Done ──', value: SUBMIT_VALUE },
    ],
    [rows],
  );

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{ix.message}</Text>
      <SelectInput
        items={items}
        onSelect={(item) => {
          if (item.value === SUBMIT_VALUE) {
            ix.resolve(rows.filter((r) => r.checked).map((r) => r.value));
            clearInteraction(setState);
            return;
          }
          const idx = item.value as number;
          setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, checked: !r.checked } : r)));
        }}
      />
      <Text dimColor>Enter: toggle row or finish</Text>
    </Box>
  );
}

/** 渲染 Reporter 的进度条、日志与阻塞式交互（供 App 内嵌）。 */
export function ReporterShell({
  state,
  setState,
}: {
  state: TuiReporterState;
  setState: Dispatch<SetStateAction<TuiReporterState>>;
}) {
  const ix = state.interaction;
  const tail = state.logs.slice(-12);
  return (
    <Box flexDirection="column">
      {state.progress ? (
        <Text dimColor>
          {state.progress.stage} ({state.progress.current}/{state.progress.total})
        </Text>
      ) : null}
      {tail.length > 0 ? (
        <Box flexDirection="column">
          {tail.map((l) => (
            <Text
              key={l.id}
              color={l.kind === 'error' ? 'red' : l.kind === 'warn' ? 'yellow' : undefined}
            >
              {l.text}
            </Text>
          ))}
        </Box>
      ) : null}
      {ix?.type === 'confirm' ? <ConfirmIx ix={ix} setState={setState} /> : null}
      {ix?.type === 'prompt' ? <PromptIx key={ix.id} ix={ix} setState={setState} /> : null}
      {ix?.type === 'selectOne' ? <SelectOneIx ix={ix} setState={setState} /> : null}
      {ix?.type === 'multiSelect' ? (
        <MultiSelectIx key={ix.id} ix={ix} setState={setState} />
      ) : null}
    </Box>
  );
}

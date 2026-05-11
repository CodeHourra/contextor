import { checkbox, confirm, input, select } from '@inquirer/prompts';
import pc from 'picocolors';
import type { Reporter } from '../commands/types.js';

export function cliReporter(): Reporter {
  return {
    info: (m) => console.log(pc.cyan(m)),
    warn: (m) => console.warn(pc.yellow(m)),
    success: (m) => console.log(pc.green(m)),
    error: (m) => console.error(pc.red(m)),
    confirm: (message) => confirm({ message, default: false }),
    prompt: (message, def) => input({ message, default: def ?? '' }),
    selectOne: async (message, choices) =>
      (await select({
        message,
        choices: choices.map((c) => ({ name: c.label, value: c.value })),
      })) as never,
    multiSelect: async (message, choices) =>
      (await checkbox({
        message,
        choices: choices.map((c) => ({
          name: c.label,
          value: c.value,
          checked: c.checked ?? false,
        })),
      })) as never,
    progress: (stage, current, total) => {
      console.log(pc.dim(`[${stage}] ${current}/${total}`));
    },
  };
}

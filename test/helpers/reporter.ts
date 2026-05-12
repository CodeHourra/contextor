import type { Reporter } from '../../src/commands/types.js';

export type MockReporterAnswers = {
  confirm?: boolean;
  /** 未设置时：prompt 返回 defaultValue / 空串 */
  prompt?: string;
};

/** 测试用 Reporter：日志为 no-op，交互方法立即 resolve 为固定答案（无真实 TUI） */
export function mockReporter(answers?: MockReporterAnswers): Reporter {
  return {
    info: () => {},
    warn: () => {},
    success: () => {},
    error: () => {},
    confirm: () => Promise.resolve(answers?.confirm ?? true),
    prompt: (_p, def) => Promise.resolve(answers?.prompt ?? def ?? ''),
    selectOne: (_p, choices) => {
      const first = choices[0];
      if (!first) throw new Error('mockReporter.selectOne: empty choices');
      return Promise.resolve(first.value);
    },
    multiSelect: (_p, choices) => Promise.resolve(choices.map((c) => c.value)),
  };
}

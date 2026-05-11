import { Command } from 'commander';

const program = new Command();
program
  .name('contextor')
  .description('Project-level developer context sync (SQLite-backed)')
  .version('0.1.0');

program
  .command('version')
  .description('print version')
  .action(() => {
    console.log('contextor 0.1.0');
  });

// 不带参数 → TUI 入口（占位，后续 Task 5.1 实装）
program.action(async () => {
  console.log('TUI not implemented yet. Run `contextor --help` for available commands.');
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});

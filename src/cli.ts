import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { cliReporter } from './cli/reporter.js';
import { add as addCmd } from './commands/add.js';
import { diff as diffCmd } from './commands/diff.js';
import { doctor as doctorCmd } from './commands/doctor.js';
import { gc as gcCmd } from './commands/gc.js';
import { init as initCmd } from './commands/init.js';
import { link as linkCmd } from './commands/link.js';
import { ls as lsCmd } from './commands/ls.js';
import { projects as projectsCmd } from './commands/projects.js';
import { remove as removeCmd } from './commands/remove.js';
import { rename as renameCmd } from './commands/rename.js';
import { restore as restoreCmd } from './commands/restore.js';
import { rm as rmCmd } from './commands/rm.js';
import { addRule, listRules, rmRule } from './commands/rules.js';
import { lookupProjectByCwd, save as saveCmd } from './commands/save.js';
import { status as statusFn } from './commands/status.js';
import { cleanTrash, listTrash, restoreFromTrash, showTrash } from './commands/trash.js';
import type { ProjectRow } from './commands/types.js';
import { expandManifest, listManifest } from './core/manifest.js';
import { detectProjectRoot } from './core/project.js';
import { openDb } from './db/index.js';
import type { Db } from './db/index.js';
import { DB_PATH, TRASH_DIR } from './utils/home.js';

const VERSION = '0.1.0';

const reporter = cliReporter();

function cwdFrom(cmd: Command): string {
  const g = cmd.optsWithGlobals() as { cwd?: string };
  return g.cwd ? resolve(g.cwd) : process.cwd();
}

function openCliDb(cmd: Command): Db {
  const g = cmd.optsWithGlobals() as { db?: string };
  const path = g.db ? resolve(g.db) : DB_PATH;
  if (path !== DB_PATH) {
    mkdirSync(dirname(path), { recursive: true });
  }
  return openDb(path);
}

function requireProject(db: Db, cwd: string): ProjectRow {
  const found = lookupProjectByCwd(db, cwd);
  if (found === 'unknown') {
    throw new Error('Ambiguous project: multiple projects match this directory.');
  }
  if (!found) {
    throw new Error('Not in a known project. Run `contextor init` first.');
  }
  return found;
}

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)([dhms])$/);
  if (!m?.[1] || !m[2]) throw new Error(`Invalid duration: ${s}`);
  const n = Number.parseInt(m[1], 10);
  const unit = m[2];
  const mult = { d: 86400_000, h: 3600_000, m: 60_000, s: 1000 }[unit] as number;
  return Date.now() - n * mult;
}

async function withCliErrors(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    reporter.error(String((e as Error)?.message ?? e));
    process.exit(1);
  }
}

const program = new Command();
program
  .name('contextor')
  .description('Project-level developer context sync (SQLite-backed)')
  .version(VERSION)
  .option('--db <path>', 'override default database file path')
  .option('--cwd <path>', 'override working directory for project resolution')
  .option('--tui', 'force TUI menu (placeholder until Task 5.3)');

program
  .command('init')
  .description('register current repo as a project and optionally first save')
  .option('--alias <name>', 'project alias')
  .option('--no-scan', 'skip global-rule scan')
  .option('--yes', 'non-interactive: auto-confirm prompts')
  .action(async (opts: { alias?: string; scan?: boolean; yes?: boolean }, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const cwd = cwdFrom(cmd);
      const r = await initCmd(
        db,
        { cwd, alias: opts.alias, noScan: opts.scan === false, yes: !!opts.yes },
        reporter,
      );
      if (r.linked) reporter.success(`Linked to existing project ${r.project.alias}.`);
      else reporter.success(`Initialized "${r.project.alias}" with ${r.saved} files saved.`);
    });
  });

program
  .command('save')
  .description('snapshot managed files into the database')
  .option('-m, --message <msg>', 'optional save message')
  .option('--allow-large', 'include files over the large-file threshold')
  .option('--dry-run', 'plan only, do not write')
  .action(
    async (opts: { message?: string; allowLarge?: boolean; dryRun?: boolean }, cmd: Command) => {
      await withCliErrors(async () => {
        const db = openCliDb(cmd);
        const cwd = cwdFrom(cmd);
        const r = await saveCmd(
          db,
          {
            cwd,
            message: opts.message,
            allowLarge: !!opts.allowLarge,
            dryRun: !!opts.dryRun,
          },
          reporter,
        );
        if (r.added === 0 && r.updated === 0 && r.removed === 0) return;
        reporter.success(`+${r.added}  ~${r.updated}  -${r.removed}`);
      });
    },
  );

program
  .command('restore [alias]')
  .description('restore snapshot from DB to working tree')
  .option('--yes', 'skip overwrite confirmation')
  .option('--no-backup', 'do not write restore-time trash backup')
  .option('--only <glob>', 'restore only paths matching glob')
  .option('--dry-run', 'show plan only')
  .action(
    async (
      alias: string | undefined,
      opts: { yes?: boolean; backup?: boolean; only?: string; dryRun?: boolean },
      cmd: Command,
    ) => {
      await withCliErrors(async () => {
        const db = openCliDb(cmd);
        const cwd = cwdFrom(cmd);
        const r = await restoreCmd(
          db,
          {
            cwd,
            alias,
            yes: !!opts.yes,
            noBackup: opts.backup === false,
            only: opts.only,
            dryRun: !!opts.dryRun,
          },
          reporter,
        );
        if (r.dryRun) {
          reporter.info('Dry run — no files written.');
          return;
        }
        reporter.success(
          `restored=${r.restored} created=${r.created.length} changed=${r.changed.length} kept_local=${r.untrackedKept.length}`,
        );
      });
    },
  );

program
  .command('add <paths...>')
  .description('add manifest include/exclude paths')
  .option('--exclude', 'add as exclude rule')
  .action(async (paths: string[], opts: { exclude?: boolean }, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const cwd = cwdFrom(cmd);
      const project = requireProject(db, cwd);
      const r = await addCmd(db, project.id, paths, { exclude: !!opts.exclude });
      reporter.success(`Added ${r.added.length} entries.`);
    });
  });

program
  .command('rm <paths...>')
  .description('remove manifest paths')
  .action(async (paths: string[], _opts: object, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const cwd = cwdFrom(cmd);
      const project = requireProject(db, cwd);
      const r = await rmCmd(db, project.id, paths);
      reporter.success(`Removed ${r.removed} manifest row(s).`);
    });
  });

program
  .command('ls')
  .description('list manifest entries or expanded files')
  .option('--all', 'list expanded files (from manifest + disk)')
  .action(async (opts: { all?: boolean }, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const cwd = cwdFrom(cmd);
      const project = requireProject(db, cwd);
      if (opts.all) {
        const { root } = detectProjectRoot(cwd);
        const projectRoot = resolve(project.root_path_hint ?? root);
        const manifest = listManifest(db, project.id);
        const expanded = expandManifest(projectRoot, manifest);
        for (const e of expanded) {
          console.log(`${e.isDir ? 'd' : '-'} ${e.rel} (${e.size}b)`);
        }
      } else {
        const list = await lsCmd(db, project.id);
        for (const e of list) {
          console.log(`${e.kind}\t${e.path}`);
        }
      }
    });
  });

program
  .command('status')
  .description('compare DB snapshot to working tree')
  .action(async (_opts: object, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const cwd = cwdFrom(cmd);
      const project = requireProject(db, cwd);
      const s = statusFn(db, project.id, cwd);
      const lines: { tag: string; path: string }[] = [];
      for (const p of s.unchanged) lines.push({ tag: ' ', path: p });
      for (const p of s.changed) lines.push({ tag: 'M', path: p });
      for (const p of s.created) lines.push({ tag: '!', path: p });
      for (const p of s.untracked) lines.push({ tag: '?', path: p });
      lines.sort((a, b) => a.path.localeCompare(b.path));
      for (const { tag, path } of lines) {
        console.log(`${tag} ${path}`);
      }
    });
  });

program
  .command('diff [path]')
  .description('unified diff for one managed file (or all changed if path omitted)')
  .action(async (rel: string | undefined, _opts: object, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const cwd = cwdFrom(cmd);
      const project = requireProject(db, cwd);
      if (rel) {
        const patch = diffCmd(db, project.id, cwd, rel);
        console.log(pc.bold(rel));
        console.log(patch);
        return;
      }
      const s = statusFn(db, project.id, cwd);
      const targets = [...s.changed];
      if (targets.length === 0) {
        reporter.info('No changed files to diff.');
        return;
      }
      for (const p of targets) {
        console.log(pc.bold(p));
        console.log(diffCmd(db, project.id, cwd, p));
      }
    });
  });

program
  .command('projects')
  .description('list registered projects')
  .option('--json', 'print JSON')
  .action(async (opts: { json?: boolean }, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const list = await projectsCmd(db);
      if (opts.json) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      for (const p of list) {
        const last = p.lastSavedAt != null ? String(p.lastSavedAt) : '-';
        console.log(
          `${p.alias.padEnd(20)} ${(p.remote_url ?? '-').padEnd(40)} files=${p.fileCount} last=${last}`,
        );
      }
    });
  });

program
  .command('link <alias>')
  .description('bind cwd (git root) to an existing project alias')
  .action(async (alias: string, _opts: object, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const cwd = cwdFrom(cmd);
      await linkCmd(db, alias, cwd);
      reporter.success(`Linked cwd to ${alias}.`);
    });
  });

program
  .command('rename <oldAlias> <newAlias>')
  .description('rename a project alias')
  .action(async (oldAlias: string, newAlias: string, _opts: object, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      await renameCmd(db, oldAlias, newAlias);
      reporter.success(`Renamed ${oldAlias} → ${newAlias}.`);
    });
  });

program
  .command('remove <alias>')
  .description('delete a project and its manifest/snapshot rows')
  .option('--yes', 'skip confirmation')
  .action(async (alias: string, opts: { yes?: boolean }, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      await removeCmd(db, alias, { yes: !!opts.yes }, reporter);
    });
  });

const rules = program.command('rules').description('manage global scan rules');
rules
  .command('add <pattern>')
  .description('append a custom global rule')
  .action(async (pattern: string, _opts: object, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      addRule(db, pattern);
      reporter.success(`Added rule "${pattern}".`);
    });
  });
rules
  .command('rm <pattern>')
  .description('remove a non-default global rule')
  .action(async (pattern: string, _opts: object, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      rmRule(db, pattern);
      reporter.success(`Removed rule "${pattern}".`);
    });
  });
rules.action(async (_opts: object, cmd: Command) => {
  await withCliErrors(async () => {
    const db = openCliDb(cmd);
    for (const r of listRules(db)) {
      console.log(`${r.isDefault ? '*' : ' '} ${r.pattern}`);
    }
  });
});

const trash = program.command('trash').description('restore-time backups under ~/.contextor/trash');
trash
  .command('list')
  .description('list trash bundles')
  .option('--project <alias>', 'filter by project alias')
  .action(async (opts: { project?: string }, cmd: Command) => {
    await withCliErrors(async () => {
      openCliDb(cmd);
      for (const e of listTrash(TRASH_DIR, opts.project)) {
        console.log(`${e.id}  alias=${e.alias}  files=${e.files.length}`);
      }
    });
  });
trash
  .command('show <id>')
  .description('print file paths in a trash bundle')
  .action(async (id: string) => {
    await withCliErrors(async () => {
      const m = showTrash(TRASH_DIR, id);
      for (const f of m.files) {
        console.log(f.path);
      }
    });
  });
trash
  .command('restore <id>')
  .description('restore files from a trash bundle into cwd project')
  .option('--yes', 'overwrite without prompting')
  .action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const cwd = cwdFrom(cmd);
      const project = requireProject(db, cwd);
      const { root } = detectProjectRoot(cwd);
      const projectRoot = resolve(project.root_path_hint ?? root);
      const { restored } = await restoreFromTrash(
        TRASH_DIR,
        id,
        projectRoot,
        { yes: !!opts.yes },
        reporter,
      );
      reporter.success(`Restored ${restored.length} files.`);
    });
  });
trash
  .command('clean')
  .description('delete old trash directories (requires --before)')
  .option('--before <duration>', 'e.g. 30d / 7d / 24h — remove entries older than this window')
  .option('--yes', 'skip per-entry confirmation')
  .action(async (opts: { before?: string; yes?: boolean }, cmd: Command) => {
    await withCliErrors(async () => {
      if (!opts.before) {
        throw new Error('trash clean requires --before <duration> (e.g. 30d)');
      }
      openCliDb(cmd);
      const beforeMs = parseDuration(opts.before);
      const removed = await cleanTrash(TRASH_DIR, { beforeMs, yes: !!opts.yes }, reporter);
      reporter.success(`Cleaned ${removed} entries.`);
    });
  });

program
  .command('doctor')
  .description('run health checks on DB and environment')
  .action(async (_opts: object, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const cwd = cwdFrom(cmd);
      const r = await doctorCmd(db, cwd, reporter);
      console.log(JSON.stringify(r, null, 2));
    });
  });

program
  .command('gc')
  .description('remove orphan content blobs')
  .action(async (_opts: object, cmd: Command) => {
    await withCliErrors(async () => {
      const db = openCliDb(cmd);
      const n = gcCmd(db);
      reporter.success(`GC removed ${n} blobs.`);
    });
  });

program
  .command('version')
  .description('print CLI version string')
  .action(() => {
    console.log(`contextor ${VERSION}`);
  });

program.action(async function (this: Command) {
  const g = this.optsWithGlobals() as { tui?: boolean; db?: string; cwd?: string };
  if (g.tui || process.stdin.isTTY) {
    const { runTui } = await import('./tui/App.js');
    await runTui({ db: g.db, cwd: g.cwd });
    return;
  }
  program.outputHelp();
});

program.configureHelp({ sortSubcommands: true });

void program.parseAsync(process.argv).catch((err) => {
  reporter.error(String((err as Error)?.message ?? err));
  process.exit(1);
});

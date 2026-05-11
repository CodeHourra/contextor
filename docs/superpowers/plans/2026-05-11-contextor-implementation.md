# contextor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `contextor` v1 — 项目级开发上下文（`.claude/`、`.cursor/`、`.codebuddy/`、`.codex/`、`.gemini/`、`.vscode/`、`.env*`、`AGENTS.md`、`CLAUDE.md` 等）的本地 SQLite 同步与还原工具，支持 CLI flag 与 TUI 入口菜单两种形态。

**Architecture:** 三层分离架构。`core/*` 提供领域无 UI 函数；`commands/*` 是 UI 无关的业务逻辑，接收 options + reporter 返回结构化结果；`cli.ts` 与 `tui/*` 各自实现 reporter 把结果渲染给用户。所有持久化走 better-sqlite3 单文件 `~/.contextor/contextor.db`。

**Tech Stack:** Node 20+ / TypeScript（strict）/ pnpm / commander / ink / @inquirer/prompts / better-sqlite3 / picomatch / diff / picocolors / vitest / biome / tsup

**Spec：** `docs/superpowers/specs/2026-05-11-contextor-design.md`

---

## File Structure

```
contextor/
├─ src/
│  ├─ cli.ts                       # commander 入口，无参 → TUI
│  ├─ tui/
│  │  ├─ App.tsx                   # ink 根 + 屏幕路由
│  │  ├─ context.ts                # React Context（db / activeProject / theme）
│  │  ├─ reporter.tsx              # TUI 版 Reporter 桥接
│  │  ├─ components/
│  │  │  ├─ Checklist.tsx          # 多选清单（自实现，space 勾选）
│  │  │  ├─ Confirm.tsx            # y/N 确认
│  │  │  ├─ Progress.tsx           # 进度列表
│  │  │  └─ DiffView.tsx           # 文本 diff 着色 + 滚动
│  │  └─ screens/
│  │     ├─ MainMenu.tsx
│  │     ├─ ScreenInit.tsx
│  │     ├─ ScreenSave.tsx
│  │     ├─ ScreenRestore.tsx
│  │     ├─ ScreenAdd.tsx
│  │     ├─ ScreenRm.tsx
│  │     ├─ ScreenLs.tsx
│  │     ├─ ScreenStatus.tsx
│  │     ├─ ScreenDiff.tsx
│  │     ├─ ScreenProjects.tsx     # 含 link/rename/remove 子流程
│  │     ├─ ScreenRules.tsx
│  │     ├─ ScreenTrash.tsx
│  │     └─ ScreenDoctor.tsx
│  ├─ commands/                    # UI 无关业务逻辑
│  │  ├─ types.ts                  # Reporter / 共用类型
│  │  ├─ init.ts
│  │  ├─ save.ts
│  │  ├─ restore.ts
│  │  ├─ add.ts
│  │  ├─ rm.ts
│  │  ├─ ls.ts
│  │  ├─ status.ts
│  │  ├─ diff.ts
│  │  ├─ projects.ts
│  │  ├─ link.ts
│  │  ├─ rename.ts
│  │  ├─ remove.ts
│  │  ├─ rules.ts
│  │  ├─ trash.ts
│  │  ├─ doctor.ts
│  │  └─ gc.ts
│  ├─ core/
│  │  ├─ project.ts                # findGitRoot / readOriginRemote / normalizeRemoteUrl
│  │  ├─ blob.ts                   # sha256 + insertBlob + getBlob + GC
│  │  ├─ manifest.ts               # expandManifest（include/exclude 展开）
│  │  ├─ scanner.ts                # 按 global rules 扫描候选
│  │  ├─ conflict.ts               # NEW / CHANGED / UNTRACKED 三组分类
│  │  ├─ trash.ts                  # 备份路径 + manifest.json
│  │  └─ paths.ts                  # 项目内相对路径工具（POSIX + 防 .. 逃逸）
│  ├─ db/
│  │  ├─ schema.sql
│  │  ├─ index.ts                  # better-sqlite3 wrapper（PRAGMA + chmod）
│  │  └─ migrations/               # 占位
│  ├─ cli/
│  │  └─ reporter.ts               # CLI 版 Reporter（@inquirer/prompts）
│  └─ utils/
│     ├─ home.ts                   # ~/.contextor 路径
│     └─ time.ts                   # epoch ms / UTC ISO
├─ test/
│  ├─ unit/                        # 与 src/ 同名映射
│  └─ integration/                 # E2E
├─ docs/superpowers/specs/         # 设计 spec
├─ docs/superpowers/plans/         # 本文件
├─ package.json
├─ tsconfig.json
├─ biome.json
├─ tsup.config.ts
├─ vitest.config.ts
├─ .gitignore
└─ README.md
```

**架构铁律：** `src/commands/*` 与 `src/core/*` 严禁 import `ink` 或 `commander`。`src/tui/*` 严禁 import `commander`。`src/cli/*` 严禁 import `ink`。

---

## 阶段 0：项目脚手架

### Task 0.1：初始化 package.json 与 pnpm

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.npmrc`

- [ ] **Step 1：创建 `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
.DS_Store
*.log
.vscode/
.idea/
```

- [ ] **Step 2：创建 `.npmrc`**

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 3：创建 `package.json`**

```json
{
  "name": "contextor",
  "version": "0.1.0",
  "description": "Project-level developer context sync tool (SQLite-backed)",
  "type": "module",
  "bin": {
    "contextor": "./dist/cli.js"
  },
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "ci": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "better-sqlite3": "^11.3.0",
    "commander": "^12.1.0",
    "diff": "^7.0.0",
    "ink": "^5.0.1",
    "ink-select-input": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^6.0.0",
    "picocolors": "^1.1.0",
    "picomatch": "^4.0.2",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/better-sqlite3": "^7.6.11",
    "@types/diff": "^6.0.0",
    "@types/node": "^22.0.0",
    "@types/picomatch": "^3.0.1",
    "@types/react": "^18.3.0",
    "ink-testing-library": "^4.0.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "@biomejs/biome",
      "better-sqlite3",
      "esbuild"
    ]
  }
}
```

> 说明：pnpm 9+ 默认收紧 lifecycle scripts，`better-sqlite3`（原生 prebuild-install）/ `esbuild` / `@biomejs/biome` 必须在 allowlist 中显式放行，否则原生模块不可加载，Task 1.1 起会失败。

- [ ] **Step 4：安装依赖**

Run: `pnpm install`
Expected: 成功安装，`pnpm-lock.yaml` 生成。

- [ ] **Step 5：commit**

```bash
git add .gitignore .npmrc package.json pnpm-lock.yaml
git commit -m "chore: 初始化 package.json 与 pnpm 依赖"
```

---

### Task 0.2：TypeScript / biome / vitest / tsup 配置

**Files:**
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `vitest.config.ts`
- Create: `tsup.config.ts`

- [ ] **Step 1：`tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 2：`biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": ["dist", "node_modules", "coverage"]
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "useImportType": "off"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "organizeImports": { "enabled": true },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all",
      "semicolons": "always"
    }
  }
}
```

- [ ] **Step 3：`vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    globals: false,
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**'],
    },
  },
});
```

- [ ] **Step 4：`tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  dts: false,
  splitting: false,
  sourcemap: true,
});
```

- [ ] **Step 5：lint 与 typecheck 通过**

Run: `pnpm lint && pnpm typecheck`
Expected: 0 errors（此时无 src 文件，typecheck 应直接通过）。

- [ ] **Step 6：commit**

```bash
git add tsconfig.json biome.json vitest.config.ts tsup.config.ts
git commit -m "chore: 配置 TypeScript / biome / vitest / tsup"
```

---

### Task 0.3：CLI 骨架 + version 命令

**Files:**
- Create: `src/cli.ts`
- Create: `src/utils/home.ts`
- Create: `src/utils/time.ts`
- Test: `test/unit/utils/home.test.ts`

- [ ] **Step 1：`src/utils/home.ts`**

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONTEXTOR_DIR = join(homedir(), '.contextor');
export const DB_PATH = join(CONTEXTOR_DIR, 'contextor.db');
export const TRASH_DIR = join(CONTEXTOR_DIR, 'trash');
```

- [ ] **Step 2：`src/utils/time.ts`**

```ts
export function nowMs(): number {
  return Date.now();
}

export function utcIsoCompact(d: Date = new Date()): string {
  // 2026-05-11T07:30:42Z → 20260511T073042Z（用于文件夹名）
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
```

- [ ] **Step 3：失败测试 `test/unit/utils/home.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { CONTEXTOR_DIR, DB_PATH, TRASH_DIR } from '../../../src/utils/home.js';

describe('home paths', () => {
  it('CONTEXTOR_DIR ends with .contextor', () => {
    expect(CONTEXTOR_DIR.endsWith('/.contextor')).toBe(true);
  });
  it('DB_PATH is contextor.db under CONTEXTOR_DIR', () => {
    expect(DB_PATH).toBe(`${CONTEXTOR_DIR}/contextor.db`);
  });
  it('TRASH_DIR is trash under CONTEXTOR_DIR', () => {
    expect(TRASH_DIR).toBe(`${CONTEXTOR_DIR}/trash`);
  });
});
```

- [ ] **Step 4：运行测试**

Run: `pnpm test`
Expected: 3 passed.

- [ ] **Step 5：`src/cli.ts` 骨架**

```ts
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
```

- [ ] **Step 6：smoke run**

Run: `pnpm dev version`
Expected: 输出 `contextor 0.1.0`。

- [ ] **Step 7：commit**

```bash
git add src/utils src/cli.ts test/unit/utils
git commit -m "feat(cli): 添加 CLI 骨架与 version 命令"
```

---

## 阶段 1：DB 基础

### Task 1.1：SQLite schema 与 db wrapper

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/index.ts`
- Test: `test/unit/db/index.test.ts`

- [ ] **Step 1：`src/db/schema.sql`**（与 spec §2.2 对齐）

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alias           TEXT NOT NULL UNIQUE,
  remote_url      TEXT UNIQUE,
  root_path_hint  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_blobs (
  hash               TEXT PRIMARY KEY,
  content            BLOB NOT NULL,
  size               INTEGER NOT NULL,
  encryption_method  TEXT NOT NULL DEFAULT 'none',
  created_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS managed_files (
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  blob_hash    TEXT NOT NULL REFERENCES file_blobs(hash),
  mode         INTEGER NOT NULL,
  is_dir       INTEGER NOT NULL DEFAULT 0,
  saved_at     INTEGER NOT NULL,
  PRIMARY KEY (project_id, path)
);

CREATE TABLE IF NOT EXISTS manifest_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('include','exclude')),
  created_at   INTEGER NOT NULL,
  UNIQUE (project_id, path, kind)
);

CREATE TABLE IF NOT EXISTS global_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern      TEXT NOT NULL UNIQUE,
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_managed_files_project ON managed_files(project_id);
CREATE INDEX IF NOT EXISTS idx_manifest_project ON manifest_entries(project_id);
```

- [ ] **Step 2：`src/db/index.ts`**

```ts
import { chmodSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { CONTEXTOR_DIR, DB_PATH } from '../utils/home.js';
import { nowMs } from '../utils/time.js';

const SCHEMA_VERSION = '1';
const DEFAULT_RULES = [
  '.claude/',
  '.cursor/',
  '.codebuddy/',
  '.codex/',
  '.gemini/',
  '.vscode/',
  '.env*',
  'AGENTS.md',
  'CLAUDE.md',
];

function ensureDir(): void {
  mkdirSync(CONTEXTOR_DIR, { recursive: true, mode: 0o700 });
  try {
    chmodSync(CONTEXTOR_DIR, 0o700);
  } catch {
    /* best-effort */
  }
}

function ensureDbPerm(path: string): void {
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort */
  }
}

export type Db = Database.Database;

export function openDb(path: string = DB_PATH): Db {
  ensureDir();
  const db = new Database(path);
  ensureDbPerm(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  seedMeta(db);
  seedDefaultRules(db);
  return db;
}

function seedMeta(db: Db): void {
  const row = db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('schema_version') as { value: string } | undefined;
  if (!row) {
    db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run(
      'schema_version',
      SCHEMA_VERSION,
    );
  }
}

function seedDefaultRules(db: Db): void {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO global_rules(pattern, is_default, created_at) VALUES (?, 1, ?)',
  );
  const now = nowMs();
  const tx = db.transaction((patterns: string[]) => {
    for (const p of patterns) stmt.run(p, now);
  });
  tx(DEFAULT_RULES);
}

export function dbFileSize(path: string = DB_PATH): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 3：失败测试 `test/unit/db/index.test.ts`**

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../../src/db/index.js';

describe('openDb', () => {
  let tmp: string;
  let dbPath: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-test-'));
    dbPath = join(tmp, 'test.db');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('creates schema and seeds default rules', () => {
    const db = openDb(dbPath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'projects',
        'file_blobs',
        'managed_files',
        'manifest_entries',
        'global_rules',
        'meta',
      ]),
    );

    const rules = db
      .prepare('SELECT pattern FROM global_rules WHERE is_default = 1 ORDER BY pattern')
      .all() as Array<{ pattern: string }>;
    expect(rules.map((r) => r.pattern)).toEqual([
      '.claude/',
      '.codebuddy/',
      '.codex/',
      '.cursor/',
      '.env*',
      '.gemini/',
      '.vscode/',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    db.close();
  });

  it('is idempotent on second open', () => {
    openDb(dbPath).close();
    const db = openDb(dbPath);
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM global_rules WHERE is_default = 1')
      .get() as { n: number };
    expect(count.n).toBe(9);
    db.close();
  });
});
```

- [ ] **Step 4：运行测试**

Run: `pnpm test`
Expected: 5 passed（含 Task 0.3 的 3 个）。

> 注：`tsup` 默认不会把 `schema.sql` 拷到 `dist/db/`。在 `tsup.config.ts` 加 `loader: { '.sql': 'text' }` 然后改 `index.ts` 用 import；或更简单：把 schema 内联为字符串常量。本 plan 选择**内联**避免运行时文件读取。

- [ ] **Step 5：把 schema 内联到 index.ts**

修改 `src/db/index.ts`：删除 `readFileSync` + `schema.sql` 加载，改为顶部常量：

```ts
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alias           TEXT NOT NULL UNIQUE,
  remote_url      TEXT UNIQUE,
  root_path_hint  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_blobs (
  hash               TEXT PRIMARY KEY,
  content            BLOB NOT NULL,
  size               INTEGER NOT NULL,
  encryption_method  TEXT NOT NULL DEFAULT 'none',
  created_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS managed_files (
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  blob_hash    TEXT NOT NULL REFERENCES file_blobs(hash),
  mode         INTEGER NOT NULL,
  is_dir       INTEGER NOT NULL DEFAULT 0,
  saved_at     INTEGER NOT NULL,
  PRIMARY KEY (project_id, path)
);

CREATE TABLE IF NOT EXISTS manifest_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('include','exclude')),
  created_at   INTEGER NOT NULL,
  UNIQUE (project_id, path, kind)
);

CREATE TABLE IF NOT EXISTS global_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern      TEXT NOT NULL UNIQUE,
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_managed_files_project ON managed_files(project_id);
CREATE INDEX IF NOT EXISTS idx_manifest_project ON manifest_entries(project_id);
`;
```

并把 `db.exec(schema)` 改成 `db.exec(SCHEMA_SQL)`。`schema.sql` 文件保留作为参考但不再被运行时使用。

- [ ] **Step 6：再跑测试 + lint + typecheck**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 全绿。

- [ ] **Step 7：commit**

```bash
git add src/db test/unit/db
git commit -m "feat(db): 添加 SQLite schema 与 db wrapper"
```

---

## 阶段 2：core 领域层

### Task 2.1：core/project — git remote 标准化与项目根定位

**Files:**
- Create: `src/core/project.ts`
- Test: `test/unit/core/project.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeRemoteUrl } from '../../../src/core/project.js';

describe('normalizeRemoteUrl', () => {
  it('strips https + .git + lowercases', () => {
    expect(normalizeRemoteUrl('https://github.com/Foo/Bar.git')).toBe('github.com/foo/bar');
  });
  it('handles ssh form git@host:owner/repo.git', () => {
    expect(normalizeRemoteUrl('git@github.com:Foo/Bar.git')).toBe('github.com/foo/bar');
  });
  it('handles ssh+git protocol', () => {
    expect(normalizeRemoteUrl('ssh://git@gitlab.com/foo/bar')).toBe('gitlab.com/foo/bar');
  });
  it('strips trailing slash', () => {
    expect(normalizeRemoteUrl('https://github.com/foo/bar/')).toBe('github.com/foo/bar');
  });
  it('returns empty string for invalid input', () => {
    expect(normalizeRemoteUrl('')).toBe('');
  });
});
```

Run: `pnpm test`
Expected: FAIL — `normalizeRemoteUrl` 未定义。

- [ ] **Step 2：实现 `src/core/project.ts`**

```ts
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';

export function normalizeRemoteUrl(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  // git@host:owner/repo(.git)
  const sshMatch = s.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    s = `${sshMatch[1]}/${sshMatch[2]}`;
  } else {
    s = s.replace(/^https?:\/\//i, '').replace(/^ssh:\/\/(?:git@)?/i, '');
  }
  s = s.replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase();
  return s;
}

export function findGitRoot(start: string): string | null {
  let cur = resolve(start);
  const root = parse(cur).root;
  while (true) {
    if (existsSync(`${cur}/.git`)) return cur;
    if (cur === root) return null;
    cur = dirname(cur);
  }
}

export function readOriginRemote(repoRoot: string): string | null {
  try {
    const out = execSync('git remote get-url origin', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

export function detectProjectRoot(cwd: string): { root: string; remote: string | null } {
  const gitRoot = findGitRoot(cwd);
  if (gitRoot) {
    const raw = readOriginRemote(gitRoot);
    return { root: gitRoot, remote: raw ? normalizeRemoteUrl(raw) : null };
  }
  return { root: resolve(cwd), remote: null };
}
```

- [ ] **Step 3：测试通过**

Run: `pnpm test`
Expected: 5 unit tests for project all pass.

- [ ] **Step 4：再补 `findGitRoot` / `detectProjectRoot` 测试**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectProjectRoot, findGitRoot } from '../../../src/core/project.js';

describe('findGitRoot', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-git-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns null when no .git found', () => {
    expect(findGitRoot(tmp)).toBe(null);
  });

  it('walks up to find .git', () => {
    mkdirSync(join(tmp, '.git'));
    const sub = join(tmp, 'a', 'b');
    mkdirSync(sub, { recursive: true });
    expect(findGitRoot(sub)).toBe(tmp);
  });
});

describe('detectProjectRoot', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-detect-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('falls back to cwd when no git', () => {
    const r = detectProjectRoot(tmp);
    expect(r.root).toBe(tmp);
    expect(r.remote).toBe(null);
  });
});
```

Run: `pnpm test`
Expected: all green.

- [ ] **Step 5：commit**

```bash
git add src/core/project.ts test/unit/core/project.test.ts
git commit -m "feat(core): 添加 project 识别（remote 标准化 + git root 探测）"
```

---

### Task 2.2：core/blob — 内容寻址与 GC

**Files:**
- Create: `src/core/blob.ts`
- Test: `test/unit/core/blob.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gcOrphanBlobs, hashBuffer, putBlob } from '../../../src/core/blob.js';
import { openDb } from '../../../src/db/index.js';

describe('blob', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-blob-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('hashBuffer returns deterministic sha256 hex', () => {
    expect(hashBuffer(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('putBlob is idempotent', () => {
    const db = openDb(join(tmp, 't.db'));
    const buf = Buffer.from('abc');
    const h1 = putBlob(db, buf);
    const h2 = putBlob(db, buf);
    expect(h1).toBe(h2);
    const cnt = db.prepare('SELECT COUNT(*) AS n FROM file_blobs').get() as { n: number };
    expect(cnt.n).toBe(1);
    db.close();
  });

  it('gcOrphanBlobs deletes unreferenced blobs', () => {
    const db = openDb(join(tmp, 't.db'));
    const buf = Buffer.from('orphan');
    putBlob(db, buf);
    const removed = gcOrphanBlobs(db);
    expect(removed).toBe(1);
    const cnt = db.prepare('SELECT COUNT(*) AS n FROM file_blobs').get() as { n: number };
    expect(cnt.n).toBe(0);
    db.close();
  });
});
```

Run: `pnpm test`
Expected: FAIL — module not found.

- [ ] **Step 2：实现 `src/core/blob.ts`**

```ts
import { createHash } from 'node:crypto';
import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';

export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function putBlob(db: Db, content: Buffer): string {
  const hash = hashBuffer(content);
  db.prepare(
    `INSERT OR IGNORE INTO file_blobs (hash, content, size, encryption_method, created_at)
     VALUES (?, ?, ?, 'none', ?)`,
  ).run(hash, content, content.length, nowMs());
  return hash;
}

export function getBlob(db: Db, hash: string): Buffer | null {
  const row = db.prepare('SELECT content FROM file_blobs WHERE hash = ?').get(hash) as
    | { content: Buffer }
    | undefined;
  return row?.content ?? null;
}

export function gcOrphanBlobs(db: Db): number {
  const result = db
    .prepare(
      `DELETE FROM file_blobs
       WHERE hash NOT IN (SELECT DISTINCT blob_hash FROM managed_files)`,
    )
    .run();
  return result.changes;
}
```

- [ ] **Step 3：测试通过 + commit**

Run: `pnpm test`
Expected: 3 blob tests pass.

```bash
git add src/core/blob.ts test/unit/core/blob.test.ts
git commit -m "feat(core): 添加 blob 内容寻址与 GC"
```

---

### Task 2.3：core/paths + core/manifest — 路径工具与 manifest 展开

**Files:**
- Create: `src/core/paths.ts`
- Create: `src/core/manifest.ts`
- Test: `test/unit/core/paths.test.ts`
- Test: `test/unit/core/manifest.test.ts`

- [ ] **Step 1：`src/core/paths.ts`**

```ts
import { isAbsolute, relative, resolve } from 'node:path';
import { posix } from 'node:path';

export function toRelPosix(root: string, p: string): string {
  const abs = isAbsolute(p) ? p : resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path "${p}" escapes project root "${root}"`);
  }
  return rel.split(/[\\/]/).filter(Boolean).join('/');
}

export function joinPosix(...parts: string[]): string {
  return posix.join(...parts);
}
```

- [ ] **Step 2：测试 paths**

```ts
import { describe, expect, it } from 'vitest';
import { toRelPosix } from '../../../src/core/paths.js';

describe('toRelPosix', () => {
  it('normalizes nested path', () => {
    expect(toRelPosix('/a/b', '/a/b/c/d.txt')).toBe('c/d.txt');
  });
  it('throws on parent escape', () => {
    expect(() => toRelPosix('/a/b', '/a/c')).toThrow(/escapes/);
  });
  it('handles relative input', () => {
    expect(toRelPosix('/a/b', 'c/../c/d')).toBe('c/d');
  });
});
```

Run: `pnpm test`
Expected: 3 paths tests pass.

- [ ] **Step 3：`src/core/manifest.ts`**

```ts
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import picomatch from 'picomatch';
import type { Db } from '../db/index.js';
import { toRelPosix } from './paths.js';

export type ManifestEntry = { path: string; kind: 'include' | 'exclude' };

export function listManifest(db: Db, projectId: number): ManifestEntry[] {
  return db
    .prepare('SELECT path, kind FROM manifest_entries WHERE project_id = ? ORDER BY path')
    .all(projectId) as ManifestEntry[];
}

function patternToMatcher(pattern: string): (rel: string) => boolean {
  if (pattern.endsWith('/')) {
    const prefix = pattern.replace(/\/+$/, '');
    return (rel) => rel === prefix || rel.startsWith(`${prefix}/`);
  }
  const match = picomatch(pattern, { dot: true });
  return (rel) => match(rel);
}

export type ExpandedFile = { rel: string; abs: string; isDir: boolean; mode: number; size: number };

export function expandManifest(root: string, entries: ManifestEntry[]): ExpandedFile[] {
  const includes = entries.filter((e) => e.kind === 'include').map((e) => e.path);
  const excludes = entries
    .filter((e) => e.kind === 'exclude')
    .map((e) => patternToMatcher(e.path));
  const isExcluded = (rel: string) => excludes.some((m) => m(rel));

  const out = new Map<string, ExpandedFile>();
  for (const inc of includes) {
    walkInclude(root, inc, isExcluded, out);
  }
  return Array.from(out.values()).sort((a, b) => a.rel.localeCompare(b.rel));
}

function walkInclude(
  root: string,
  pattern: string,
  isExcluded: (rel: string) => boolean,
  out: Map<string, ExpandedFile>,
): void {
  // pattern 可能是: 具体相对路径 / 目录(尾随 /) / glob
  const isDirPattern = pattern.endsWith('/');
  const cleaned = pattern.replace(/\/+$/, '');

  const tryStat = (rel: string) => {
    try {
      const abs = join(root, rel);
      const s = statSync(abs);
      if (s.isDirectory()) {
        addDirEntry(rel, abs, s.mode, isExcluded, out);
        walkDir(root, rel, isExcluded, out);
      } else if (s.isFile()) {
        if (isExcluded(rel)) return;
        out.set(rel, { rel, abs, isDir: false, mode: s.mode, size: s.size });
      }
    } catch {
      /* missing entry — skip */
    }
  };

  if (isDirPattern) {
    tryStat(cleaned);
    return;
  }
  // glob 或具体文件
  if (/[*?[\]]/.test(cleaned)) {
    walkGlob(root, cleaned, isExcluded, out);
  } else {
    tryStat(cleaned);
  }
}

function walkDir(
  root: string,
  relDir: string,
  isExcluded: (rel: string) => boolean,
  out: Map<string, ExpandedFile>,
): void {
  const abs = join(root, relDir);
  let names: string[];
  try {
    names = readdirSync(abs);
  } catch {
    return;
  }
  for (const name of names) {
    const childRel = relDir ? `${relDir}/${name}` : name;
    if (childRel === '.git' || childRel.startsWith('.git/')) continue;
    if (isExcluded(childRel)) continue;
    const childAbs = join(abs, name);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(childAbs);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      addDirEntry(childRel, childAbs, s.mode, isExcluded, out);
      walkDir(root, childRel, isExcluded, out);
    } else if (s.isFile()) {
      out.set(childRel, { rel: childRel, abs: childAbs, isDir: false, mode: s.mode, size: s.size });
    }
  }
}

function addDirEntry(
  rel: string,
  abs: string,
  mode: number,
  isExcluded: (rel: string) => boolean,
  out: Map<string, ExpandedFile>,
): void {
  if (isExcluded(rel)) return;
  out.set(rel, { rel, abs, isDir: true, mode, size: 0 });
}

function walkGlob(
  root: string,
  pattern: string,
  isExcluded: (rel: string) => boolean,
  out: Map<string, ExpandedFile>,
): void {
  const match = picomatch(pattern, { dot: true });
  const stack: string[] = [''];
  while (stack.length) {
    const relDir = stack.pop() as string;
    let names: string[];
    try {
      names = readdirSync(join(root, relDir) || root);
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = relDir ? `${relDir}/${name}` : name;
      if (rel === '.git' || rel.startsWith('.git/')) continue;
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(join(root, rel));
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        stack.push(rel);
        continue;
      }
      if (match(rel) && !isExcluded(rel)) {
        out.set(rel, { rel, abs: join(root, rel), isDir: false, mode: s.mode, size: s.size });
      }
    }
  }
}

// 还需要顺手用
export { toRelPosix };
```

- [ ] **Step 4：测试 `test/unit/core/manifest.test.ts`**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expandManifest } from '../../../src/core/manifest.js';

describe('expandManifest', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-mani-'));
    mkdirSync(join(tmp, '.cursor'), { recursive: true });
    writeFileSync(join(tmp, '.cursor', 'rules.md'), 'r');
    mkdirSync(join(tmp, '.cursor', 'cache'), { recursive: true });
    writeFileSync(join(tmp, '.cursor', 'cache', 'big.bin'), 'x');
    writeFileSync(join(tmp, '.env'), 'A=1');
    writeFileSync(join(tmp, 'AGENTS.md'), '# a');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('directory pattern recurses', () => {
    const r = expandManifest(tmp, [{ path: '.cursor/', kind: 'include' }]);
    expect(r.map((e) => e.rel).sort()).toEqual([
      '.cursor',
      '.cursor/cache',
      '.cursor/cache/big.bin',
      '.cursor/rules.md',
    ]);
  });

  it('exclude removes subdir', () => {
    const r = expandManifest(tmp, [
      { path: '.cursor/', kind: 'include' },
      { path: '.cursor/cache/', kind: 'exclude' },
    ]);
    expect(r.map((e) => e.rel).sort()).toEqual(['.cursor', '.cursor/rules.md']);
  });

  it('glob pattern matches', () => {
    const r = expandManifest(tmp, [{ path: '.env*', kind: 'include' }]);
    expect(r.map((e) => e.rel)).toEqual(['.env']);
  });

  it('exact file', () => {
    const r = expandManifest(tmp, [{ path: 'AGENTS.md', kind: 'include' }]);
    expect(r.map((e) => e.rel)).toEqual(['AGENTS.md']);
  });
});
```

Run: `pnpm test`
Expected: 4 manifest tests + 3 paths + previous all pass.

- [ ] **Step 5：commit**

```bash
git add src/core/paths.ts src/core/manifest.ts test/unit/core/paths.test.ts test/unit/core/manifest.test.ts
git commit -m "feat(core): 添加 paths 与 manifest 展开（含 exclude / glob / dir）"
```

---

### Task 2.4：core/scanner — 按全局规则扫描候选

**Files:**
- Create: `src/core/scanner.ts`
- Test: `test/unit/core/scanner.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanByRules } from '../../../src/core/scanner.js';

describe('scanByRules', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'contextor-scan-'));
    mkdirSync(join(tmp, '.git'), { recursive: true });
    writeFileSync(join(tmp, '.git', 'HEAD'), 'x');
    mkdirSync(join(tmp, '.cursor'), { recursive: true });
    writeFileSync(join(tmp, '.cursor', 'rules.md'), 'r');
    writeFileSync(join(tmp, '.env'), 'A=1');
    writeFileSync(join(tmp, '.env.local'), 'B=2');
    writeFileSync(join(tmp, 'AGENTS.md'), '#');
    writeFileSync(join(tmp, 'README.md'), '#'); // not in rules
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('matches default rules and skips .git', () => {
    const r = scanByRules(tmp, ['.cursor/', '.env*', 'AGENTS.md']);
    const rels = r.map((e) => e.rel).sort();
    expect(rels).toEqual(['.cursor', '.cursor/rules.md', '.env', '.env.local', 'AGENTS.md']);
  });
});
```

Run: `pnpm test`
Expected: FAIL — module missing.

- [ ] **Step 2：实现 `src/core/scanner.ts`**

```ts
import type { ExpandedFile, ManifestEntry } from './manifest.js';
import { expandManifest } from './manifest.js';

export function scanByRules(root: string, patterns: string[]): ExpandedFile[] {
  const entries: ManifestEntry[] = patterns.map((p) => ({ path: p, kind: 'include' as const }));
  return expandManifest(root, entries);
}
```

- [ ] **Step 3：通过 + commit**

Run: `pnpm test`
Expected: scanner test passes.

```bash
git add src/core/scanner.ts test/unit/core/scanner.test.ts
git commit -m "feat(core): 添加 scanner（按全局规则扫描候选）"
```

---

### Task 2.5：core/conflict — 三组冲突分类

**Files:**
- Create: `src/core/conflict.ts`
- Test: `test/unit/core/conflict.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { classifyConflicts } from '../../../src/core/conflict.js';

describe('classifyConflicts', () => {
  it('classifies NEW / CHANGED / UNTRACKED', () => {
    const target = [
      { rel: 'a.txt', hash: 'h1' },
      { rel: 'b.txt', hash: 'h2' },
      { rel: 'c/d.txt', hash: 'h3' },
    ];
    const local = new Map<string, string | null>([
      ['a.txt', null], // missing locally → NEW
      ['b.txt', 'h2'], // unchanged → ignored
      ['c/d.txt', 'h3-different'], // changed → CHANGED
      ['extra.txt', 'hX'], // local-only → UNTRACKED
    ]);
    const r = classifyConflicts(target, local);
    expect(r.created).toEqual(['a.txt']);
    expect(r.changed).toEqual(['c/d.txt']);
    expect(r.untracked).toEqual(['extra.txt']);
    expect(r.unchanged).toEqual(['b.txt']);
  });
});
```

Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 2：实现 `src/core/conflict.ts`**

```ts
export type Target = { rel: string; hash: string };

export type Classification = {
  created: string[];   // T 有, L 无
  changed: string[];   // T 有, L 有, hash 不同
  unchanged: string[]; // T 有, L 有, hash 相同
  untracked: string[]; // L 有, T 无
};

export function classifyConflicts(
  target: Target[],
  local: Map<string, string | null>,
): Classification {
  const created: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  const untracked: string[] = [];

  const tSet = new Set(target.map((t) => t.rel));

  for (const t of target) {
    const lh = local.get(t.rel);
    if (lh == null) created.push(t.rel);
    else if (lh === t.hash) unchanged.push(t.rel);
    else changed.push(t.rel);
  }

  for (const [rel] of local) {
    if (!tSet.has(rel)) untracked.push(rel);
  }

  return {
    created: created.sort(),
    changed: changed.sort(),
    unchanged: unchanged.sort(),
    untracked: untracked.sort(),
  };
}
```

- [ ] **Step 3：通过 + commit**

```bash
git add src/core/conflict.ts test/unit/core/conflict.test.ts
git commit -m "feat(core): 添加 restore 冲突三组分类"
```

---

### Task 2.6：core/trash — 备份路径与 manifest

**Files:**
- Create: `src/core/trash.ts`
- Test: `test/unit/core/trash.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupToTrash, trashSubdir } from '../../../src/core/trash.js';

describe('trash', () => {
  let trashRoot: string;
  let projRoot: string;
  beforeEach(() => {
    trashRoot = mkdtempSync(join(tmpdir(), 'trash-'));
    projRoot = mkdtempSync(join(tmpdir(), 'proj-'));
    writeFileSync(join(projRoot, 'a.txt'), 'A');
  });
  afterEach(() => {
    rmSync(trashRoot, { recursive: true, force: true });
    rmSync(projRoot, { recursive: true, force: true });
  });

  it('trashSubdir composes alias + utc timestamp', () => {
    const sub = trashSubdir(trashRoot, 'foo', new Date('2026-05-11T07:30:42Z'));
    expect(sub).toBe(join(trashRoot, 'foo', '20260511T073042Z'));
  });

  it('backupToTrash copies files and writes manifest.json', () => {
    const dest = backupToTrash({
      trashRoot,
      projectAlias: 'foo',
      projectRoot: projRoot,
      files: ['a.txt'],
      timestamp: new Date('2026-05-11T07:30:42Z'),
    });
    expect(existsSync(join(dest, 'a.txt'))).toBe(true);
    const m = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8'));
    expect(m.project_alias).toBe('foo');
    expect(m.utc_timestamp).toBe('2026-05-11T07:30:42.000Z');
    expect(m.files).toEqual([{ path: 'a.txt' }]);
  });
});
```

Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 2：实现 `src/core/trash.ts`**

```ts
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { utcIsoCompact } from '../utils/time.js';

export function trashSubdir(trashRoot: string, alias: string, ts: Date = new Date()): string {
  return join(trashRoot, alias, utcIsoCompact(ts));
}

export type BackupParams = {
  trashRoot: string;
  projectAlias: string;
  projectRoot: string;
  files: string[];
  timestamp?: Date;
};

export function backupToTrash(p: BackupParams): string {
  const ts = p.timestamp ?? new Date();
  const dest = trashSubdir(p.trashRoot, p.projectAlias, ts);
  mkdirSync(dest, { recursive: true });
  for (const rel of p.files) {
    const srcAbs = join(p.projectRoot, rel);
    const dstAbs = join(dest, rel);
    mkdirSync(dirname(dstAbs), { recursive: true });
    copyFileSync(srcAbs, dstAbs);
  }
  const manifest = {
    project_alias: p.projectAlias,
    utc_timestamp: ts.toISOString(),
    files: p.files.map((path) => ({ path })),
  };
  writeFileSync(join(dest, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return dest;
}
```

- [ ] **Step 3：通过 + commit**

```bash
git add src/core/trash.ts test/unit/core/trash.test.ts
git commit -m "feat(core): 添加 trash 备份与 manifest"
```

---

## 阶段 3：commands 业务逻辑（UI 无关）

### Task 3.0：commands 共用类型与 Reporter 契约

**Files:**
- Create: `src/commands/types.ts`

- [ ] **Step 1：`src/commands/types.ts`**

```ts
export type Reporter = {
  info(message: string): void;
  warn(message: string): void;
  success(message: string): void;
  error(message: string): void;
  confirm(prompt: string): Promise<boolean>;
  prompt(prompt: string, defaultValue?: string): Promise<string>;
  selectOne<T extends { label: string; value: unknown }>(prompt: string, choices: T[]): Promise<T['value']>;
  multiSelect<T extends { label: string; value: unknown; checked?: boolean }>(
    prompt: string,
    choices: T[],
  ): Promise<T['value'][]>;
  progress?(stage: string, current: number, total: number): void;
};

export type ProjectRow = {
  id: number;
  alias: string;
  remote_url: string | null;
  root_path_hint: string | null;
  created_at: number;
  updated_at: number;
};
```

- [ ] **Step 2：commit**

```bash
git add src/commands/types.ts
git commit -m "feat(commands): 添加 Reporter 与共用类型契约"
```

---

### Task 3.1：commands/init

**Files:**
- Create: `src/commands/init.ts`
- Test: `test/integration/init.test.ts`

- [ ] **Step 1：实现 `src/commands/init.ts`**

```ts
import { readFileSync } from 'node:fs';
import { putBlob } from '../core/blob.js';
import type { ExpandedFile } from '../core/manifest.js';
import { detectProjectRoot } from '../core/project.js';
import { scanByRules } from '../core/scanner.js';
import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';
import type { ProjectRow, Reporter } from './types.js';

export type InitOptions = {
  cwd: string;
  alias?: string;
  noScan: boolean;
  yes: boolean;
};

export type InitResult = {
  created: boolean;
  linked: boolean;
  project: ProjectRow;
  selected: number;
  saved: number;
};

export async function init(db: Db, opts: InitOptions, reporter: Reporter): Promise<InitResult> {
  const { root, remote } = detectProjectRoot(opts.cwd);

  let alias = opts.alias;
  if (remote) {
    if (!alias) alias = aliasFromRemote(remote);
  } else {
    if (!alias) alias = await reporter.prompt('未检测到 git remote，请输入项目别名', '');
    if (!alias) throw new Error('alias is required when no git remote is found');
  }

  const existing = remote
    ? (db.prepare('SELECT * FROM projects WHERE remote_url = ?').get(remote) as ProjectRow | undefined)
    : (db.prepare('SELECT * FROM projects WHERE alias = ?').get(alias) as ProjectRow | undefined);

  if (existing) {
    if (opts.yes) {
      db.prepare('UPDATE projects SET root_path_hint = ?, updated_at = ? WHERE id = ?').run(
        root,
        nowMs(),
        existing.id,
      );
      reporter.info(`Linked current dir to existing project "${existing.alias}".`);
      return { created: false, linked: true, project: existing, selected: 0, saved: 0 };
    }
    const link = await reporter.confirm(
      `Project "${existing.alias}" already registered for this remote. Link cwd to it?`,
    );
    if (!link) throw new Error('Cancelled by user.');
    db.prepare('UPDATE projects SET root_path_hint = ?, updated_at = ? WHERE id = ?').run(
      root,
      nowMs(),
      existing.id,
    );
    return { created: false, linked: true, project: existing, selected: 0, saved: 0 };
  }

  const now = nowMs();
  const info = db
    .prepare(
      `INSERT INTO projects (alias, remote_url, root_path_hint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(alias, remote, root, now, now);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid) as ProjectRow;

  let selected: ExpandedFile[] = [];
  if (!opts.noScan) {
    const rules = (db.prepare('SELECT pattern FROM global_rules').all() as Array<{ pattern: string }>)
      .map((r) => r.pattern);
    const candidates = scanByRules(root, rules);
    if (candidates.length === 0) {
      reporter.info('No matching files for global rules.');
    } else if (opts.yes) {
      selected = candidates;
    } else {
      const choices = candidates.map((c) => ({
        label: `${c.isDir ? '[dir]' : '     '} ${c.rel}`,
        value: c.rel,
        checked: true,
      }));
      const picked = await reporter.multiSelect('Select files to manage', choices);
      const set = new Set(picked);
      selected = candidates.filter((c) => set.has(c.rel));
    }
  }

  // 写入 manifest_entries（include）
  const insertEntry = db.prepare(
    `INSERT OR IGNORE INTO manifest_entries (project_id, path, kind, created_at)
     VALUES (?, ?, 'include', ?)`,
  );
  const tx = db.transaction(() => {
    for (const e of selected) insertEntry.run(project.id, e.rel, now);
  });
  tx();

  // 立即触发一次 save：直接落盘所有 selected
  let saved = 0;
  if (selected.length > 0) {
    const insertManaged = db.prepare(
      `INSERT INTO managed_files (project_id, path, blob_hash, mode, is_dir, saved_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET blob_hash = excluded.blob_hash,
         mode = excluded.mode, is_dir = excluded.is_dir, saved_at = excluded.saved_at`,
    );
    const saveTx = db.transaction(() => {
      for (const f of selected) {
        const buf = f.isDir ? Buffer.alloc(0) : readFileSync(f.abs);
        const hash = putBlob(db, buf);
        insertManaged.run(project.id, f.rel, hash, f.mode, f.isDir ? 1 : 0, now);
        saved++;
      }
    });
    saveTx();
  }

  return { created: true, linked: false, project, selected: selected.length, saved };
}

function aliasFromRemote(remote: string): string {
  const last = remote.split('/').pop() ?? remote;
  return last.replace(/[^a-z0-9._-]/gi, '-');
}
```

- [ ] **Step 2：集成测试 `test/integration/init.test.ts`**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { init } from '../../src/commands/init.js';
import { openDb } from '../../src/db/index.js';
import { silentReporter } from '../helpers/reporter.js';

describe('init (integration)', () => {
  let proj: string;
  let dbPath: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'init-proj-'));
    dbPath = join(mkdtempSync(join(tmpdir(), 'init-db-')), 't.db');
    mkdirSync(join(proj, '.cursor'));
    writeFileSync(join(proj, '.cursor', 'rules.md'), 'r');
    writeFileSync(join(proj, '.env'), 'A=1');
  });
  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
  });

  it('creates project with --yes selecting all matched', async () => {
    const db = openDb(dbPath);
    const r = await init(db, { cwd: proj, alias: 'foo', noScan: false, yes: true }, silentReporter());
    expect(r.created).toBe(true);
    expect(r.project.alias).toBe('foo');
    expect(r.saved).toBeGreaterThan(0);

    const files = db
      .prepare('SELECT path FROM managed_files WHERE project_id = ? ORDER BY path')
      .all(r.project.id) as Array<{ path: string }>;
    expect(files.map((f) => f.path)).toContain('.env');
    expect(files.map((f) => f.path)).toContain('.cursor/rules.md');
    db.close();
  });

  it('--no-scan creates empty manifest', async () => {
    const db = openDb(dbPath);
    const r = await init(
      db,
      { cwd: proj, alias: 'bar', noScan: true, yes: true },
      silentReporter(),
    );
    expect(r.saved).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 3：测试辅助 `test/helpers/reporter.ts`**

```ts
import type { Reporter } from '../../src/commands/types.js';

export function silentReporter(answers?: Partial<{ confirm: boolean; prompt: string }>): Reporter {
  return {
    info: () => {},
    warn: () => {},
    success: () => {},
    error: () => {},
    confirm: async () => answers?.confirm ?? true,
    prompt: async (_p, def) => answers?.prompt ?? def ?? '',
    selectOne: async (_p, choices) => choices[0]!.value,
    multiSelect: async (_p, choices) => choices.map((c) => c.value),
  };
}
```

- [ ] **Step 4：跑测试**

Run: `pnpm test`
Expected: 2 init integration tests pass.

- [ ] **Step 5：commit**

```bash
git add src/commands/init.ts test/integration/init.test.ts test/helpers/reporter.ts
git commit -m "feat(commands): 添加 init 命令业务逻辑"
```

---

### Task 3.2：commands/save（含大文件保护）

**Files:**
- Create: `src/commands/save.ts`
- Test: `test/integration/save.test.ts`

- [ ] **Step 1：实现 `src/commands/save.ts`**

```ts
import { readFileSync } from 'node:fs';
import { putBlob, gcOrphanBlobs } from '../core/blob.js';
import type { Db } from '../db/index.js';
import { expandManifest, listManifest } from '../core/manifest.js';
import { detectProjectRoot } from '../core/project.js';
import { hashBuffer } from '../core/blob.js';
import { nowMs } from '../utils/time.js';
import type { ProjectRow, Reporter } from './types.js';

export const LARGE_FILE_BYTES = 10 * 1024 * 1024;

export type SaveOptions = {
  cwd: string;
  message?: string;
  allowLarge: boolean;
  dryRun: boolean;
};

export type SaveResult = {
  added: string[];
  modified: string[];
  removed: string[];
  skippedNoChange: boolean;
};

export async function save(db: Db, opts: SaveOptions, reporter: Reporter): Promise<SaveResult> {
  const project = lookupProjectByCwd(db, opts.cwd);
  if (!project) throw new Error('Not in a known project. Run `contextor init` first.');

  const manifest = listManifest(db, project.id);
  const root = project.root_path_hint ?? opts.cwd;
  const expanded = expandManifest(root, manifest);

  const tooLarge = expanded.filter((e) => !e.isDir && e.size > LARGE_FILE_BYTES);
  if (tooLarge.length > 0 && !opts.allowLarge) {
    const list = tooLarge.map((f) => `  - ${f.rel} (${(f.size / 1024 / 1024).toFixed(1)} MB)`).join('\n');
    throw new Error(
      `Files exceed ${LARGE_FILE_BYTES / 1024 / 1024} MB:\n${list}\n` +
        `Pass --allow-large to include them.`,
    );
  }

  const existing = db
    .prepare('SELECT path, blob_hash FROM managed_files WHERE project_id = ?')
    .all(project.id) as Array<{ path: string; blob_hash: string }>;
  const existingMap = new Map(existing.map((e) => [e.path, e.blob_hash]));

  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  type Plan = { rel: string; hash: string; mode: number; isDir: boolean; buf: Buffer };
  const plan: Plan[] = [];
  const expandedSet = new Set(expanded.map((e) => e.rel));

  for (const e of expanded) {
    const buf = e.isDir ? Buffer.alloc(0) : readFileSync(e.abs);
    const hash = hashBuffer(buf);
    const cur = existingMap.get(e.rel);
    if (cur === undefined) added.push(e.rel);
    else if (cur !== hash) modified.push(e.rel);
    plan.push({ rel: e.rel, hash, mode: e.mode, isDir: e.isDir, buf });
  }
  for (const ex of existing) {
    if (!expandedSet.has(ex.path)) removed.push(ex.path);
  }

  if (added.length === 0 && modified.length === 0 && removed.length === 0) {
    reporter.info('No changes — nothing to save.');
    return { added, modified, removed, skippedNoChange: true };
  }

  if (opts.dryRun) {
    return { added, modified, removed, skippedNoChange: false };
  }

  const insertManaged = db.prepare(
    `INSERT INTO managed_files (project_id, path, blob_hash, mode, is_dir, saved_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, path) DO UPDATE SET blob_hash = excluded.blob_hash,
       mode = excluded.mode, is_dir = excluded.is_dir, saved_at = excluded.saved_at`,
  );
  const deleteManaged = db.prepare('DELETE FROM managed_files WHERE project_id = ? AND path = ?');
  const updateProj = db.prepare('UPDATE projects SET updated_at = ?, root_path_hint = ? WHERE id = ?');
  const now = nowMs();

  const tx = db.transaction(() => {
    for (const p of plan) {
      const realHash = putBlob(db, p.buf);
      insertManaged.run(project.id, p.rel, realHash, p.mode, p.isDir ? 1 : 0, now);
    }
    for (const rel of removed) deleteManaged.run(project.id, rel);
    updateProj.run(now, root, project.id);
    if (opts.message) {
      db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(
        `last_save_message:${project.id}`,
        opts.message,
      );
    }
  });
  tx();

  const removedBlobs = gcOrphanBlobs(db);
  if (removedBlobs > 0) reporter.info(`GC: removed ${removedBlobs} orphan blobs`);

  return { added, modified, removed, skippedNoChange: false };
}

export function lookupProjectByCwd(db: Db, cwd: string): ProjectRow | null {
  const { remote } = detectProjectRoot(cwd);
  if (remote) {
    const row = db
      .prepare('SELECT * FROM projects WHERE remote_url = ?')
      .get(remote) as ProjectRow | undefined;
    if (row) return row;
  }
  // 退回 root_path_hint 精确匹配
  const row = db
    .prepare('SELECT * FROM projects WHERE root_path_hint = ?')
    .get(cwd) as ProjectRow | undefined;
  return row ?? null;
}
```

- [ ] **Step 2：集成测试 `test/integration/save.test.ts`**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { init } from '../../src/commands/init.js';
import { save } from '../../src/commands/save.js';
import { openDb } from '../../src/db/index.js';
import { silentReporter } from '../helpers/reporter.js';

describe('save (integration)', () => {
  let proj: string;
  let dbPath: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'save-proj-'));
    dbPath = join(mkdtempSync(join(tmpdir(), 'save-db-')), 't.db');
    writeFileSync(join(proj, '.env'), 'A=1');
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it('detects no-change and modified', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: proj, alias: 'p', noScan: false, yes: true }, silentReporter());

    const r1 = await save(db, { cwd: proj, allowLarge: false, dryRun: false }, silentReporter());
    expect(r1.skippedNoChange).toBe(true);

    writeFileSync(join(proj, '.env'), 'A=2');
    const r2 = await save(db, { cwd: proj, allowLarge: false, dryRun: false }, silentReporter());
    expect(r2.modified).toEqual(['.env']);

    db.close();
  });

  it('rejects large file without --allow-large', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: proj, alias: 'p', noScan: true, yes: true }, silentReporter());
    db.prepare(
      "INSERT INTO manifest_entries (project_id, path, kind, created_at) VALUES (?, 'big.bin', 'include', ?)",
    ).run(1, Date.now());
    writeFileSync(join(proj, 'big.bin'), Buffer.alloc(11 * 1024 * 1024));
    await expect(
      save(db, { cwd: proj, allowLarge: false, dryRun: false }, silentReporter()),
    ).rejects.toThrow(/exceed/);
    db.close();
  });
});
```

- [ ] **Step 3：跑测试 + commit**

Run: `pnpm test`

```bash
git add src/commands/save.ts test/integration/save.test.ts
git commit -m "feat(commands): 添加 save（覆盖式 + 大文件保护 + 增量 GC）"
```

---

### Task 3.3：commands/restore（D 冲突流程）

**Files:**
- Create: `src/commands/restore.ts`
- Test: `test/integration/restore.test.ts`

- [ ] **Step 1：实现 `src/commands/restore.ts`**

```ts
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import picomatch from 'picomatch';
import { hashBuffer, getBlob } from '../core/blob.js';
import { classifyConflicts } from '../core/conflict.js';
import { detectProjectRoot } from '../core/project.js';
import { backupToTrash } from '../core/trash.js';
import type { Db } from '../db/index.js';
import { TRASH_DIR } from '../utils/home.js';
import { nowMs } from '../utils/time.js';
import type { ProjectRow, Reporter } from './types.js';

export type RestoreOptions = {
  cwd: string;
  projectAlias?: string;
  yes: boolean;
  noBackup: boolean;
  only?: string;
  dryRun: boolean;
};

export type RestoreResult = {
  project: ProjectRow;
  created: string[];
  overwritten: string[];
  keptLocal: string[];
  trashPath?: string;
  cancelled?: boolean;
};

export async function restore(db: Db, opts: RestoreOptions, reporter: Reporter): Promise<RestoreResult> {
  const project = await pickProject(db, opts, reporter);
  const root = opts.cwd;

  const target = db
    .prepare('SELECT path, blob_hash, mode, is_dir FROM managed_files WHERE project_id = ?')
    .all(project.id) as Array<{ path: string; blob_hash: string; mode: number; is_dir: number }>;

  const filtered = opts.only ? target.filter(picomatch(opts.only, { dot: true })) : target;
  const target2 = filtered.map((t) => ({ rel: t.path, hash: t.blob_hash }));

  const local = new Map<string, string | null>();
  for (const t of filtered) {
    const abs = join(root, t.path);
    if (!existsSync(abs)) {
      local.set(t.path, null);
      continue;
    }
    if (t.is_dir) {
      local.set(t.path, hashBuffer(Buffer.alloc(0)));
    } else {
      try {
        const buf = readFileSync(abs);
        local.set(t.path, hashBuffer(buf));
      } catch {
        local.set(t.path, null);
      }
    }
  }

  const cls = classifyConflicts(target2, local);

  reporter.info(`Will create:    ${cls.created.length}`);
  reporter.info(`Will overwrite: ${cls.changed.length}`);
  reporter.info(`Keep local:     local-only paths in scope are skipped (untracked)`);

  if (opts.dryRun) {
    return {
      project,
      created: cls.created,
      overwritten: cls.changed,
      keptLocal: cls.untracked,
    };
  }

  if (!opts.yes) {
    const ok = await reporter.confirm('Proceed?');
    if (!ok) return { project, created: [], overwritten: [], keptLocal: [], cancelled: true };
  }

  let trashPath: string | undefined;
  if (!opts.noBackup && cls.changed.length > 0) {
    trashPath = backupToTrash({
      trashRoot: TRASH_DIR,
      projectAlias: project.alias,
      projectRoot: root,
      files: cls.changed,
    });
  }

  const fileByRel = new Map(filtered.map((t) => [t.path, t]));
  for (const rel of [...cls.created, ...cls.changed]) {
    const t = fileByRel.get(rel)!;
    const abs = join(root, rel);
    if (t.is_dir) {
      mkdirSync(abs, { recursive: true });
      try {
        chmodSync(abs, t.mode & 0o7777);
      } catch {
        /* best effort */
      }
    } else {
      const buf = getBlob(db, t.blob_hash);
      if (!buf) throw new Error(`Missing blob ${t.blob_hash} for ${rel}`);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, buf);
      try {
        chmodSync(abs, t.mode & 0o7777);
      } catch {
        /* best effort */
      }
    }
  }

  db.prepare('UPDATE projects SET updated_at = ?, root_path_hint = ? WHERE id = ?').run(
    nowMs(),
    root,
    project.id,
  );

  return {
    project,
    created: cls.created,
    overwritten: cls.changed,
    keptLocal: cls.untracked,
    trashPath,
  };
}

async function pickProject(db: Db, opts: RestoreOptions, reporter: Reporter): Promise<ProjectRow> {
  if (opts.projectAlias) {
    const row = db
      .prepare('SELECT * FROM projects WHERE alias = ?')
      .get(opts.projectAlias) as ProjectRow | undefined;
    if (!row) throw new Error(`Project "${opts.projectAlias}" not found.`);
    return row;
  }
  const { remote } = detectProjectRoot(opts.cwd);
  if (remote) {
    const row = db
      .prepare('SELECT * FROM projects WHERE remote_url = ?')
      .get(remote) as ProjectRow | undefined;
    if (row) return row;
  }
  // 没找到 → 让用户选
  const all = db
    .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
    .all() as ProjectRow[];
  if (all.length === 0) throw new Error('No projects in DB.');
  const choice = await reporter.selectOne(
    'Pick a project to restore:',
    all.map((p) => ({ label: `${p.alias} (${p.remote_url ?? 'no-remote'})`, value: p.id })),
  );
  return all.find((p) => p.id === choice)!;
}
```

- [ ] **Step 2：集成测试 `test/integration/restore.test.ts`**

```ts
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { init } from '../../src/commands/init.js';
import { restore } from '../../src/commands/restore.js';
import { openDb } from '../../src/db/index.js';
import { silentReporter } from '../helpers/reporter.js';

describe('restore (integration)', () => {
  let proj: string;
  let dbPath: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'r-proj-'));
    dbPath = join(mkdtempSync(join(tmpdir(), 'r-db-')), 't.db');
    writeFileSync(join(proj, '.env'), 'A=1');
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it('recreates missing file', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: proj, alias: 'p', noScan: false, yes: true }, silentReporter());
    unlinkSync(join(proj, '.env'));
    const r = await restore(
      db,
      { cwd: proj, projectAlias: 'p', yes: true, noBackup: true, dryRun: false },
      silentReporter(),
    );
    expect(r.created).toContain('.env');
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('A=1');
    db.close();
  });

  it('backs up & overwrites changed file', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: proj, alias: 'p', noScan: false, yes: true }, silentReporter());
    writeFileSync(join(proj, '.env'), 'A=999');
    const r = await restore(
      db,
      { cwd: proj, projectAlias: 'p', yes: true, noBackup: false, dryRun: false },
      silentReporter(),
    );
    expect(r.overwritten).toContain('.env');
    expect(r.trashPath).toBeDefined();
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('A=1');
    db.close();
  });
});
```

- [ ] **Step 3：跑测试 + commit**

```bash
git add src/commands/restore.ts test/integration/restore.test.ts
git commit -m "feat(commands): 添加 restore（D 冲突流程 + trash 备份）"
```

---

### Task 3.4：commands/add + rm + ls

**Files:**
- Create: `src/commands/add.ts`
- Create: `src/commands/rm.ts`
- Create: `src/commands/ls.ts`
- Test: `test/integration/manifest_edit.test.ts`

- [ ] **Step 1：`src/commands/add.ts`**

```ts
import type { Db } from '../db/index.js';
import { toRelPosix } from '../core/paths.js';
import { lookupProjectByCwd } from './save.js';
import { nowMs } from '../utils/time.js';
import type { Reporter } from './types.js';

export type AddOptions = { cwd: string; paths: string[]; exclude: boolean };
export async function add(db: Db, opts: AddOptions, _reporter: Reporter): Promise<{ added: string[] }> {
  const project = lookupProjectByCwd(db, opts.cwd);
  if (!project) throw new Error('Not in a known project.');
  const root = project.root_path_hint ?? opts.cwd;
  const kind = opts.exclude ? 'exclude' : 'include';
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO manifest_entries (project_id, path, kind, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  const now = nowMs();
  const added: string[] = [];
  const tx = db.transaction(() => {
    for (const p of opts.paths) {
      const rel = toRelPosix(root, p);
      const r = stmt.run(project.id, rel, kind, now);
      if (r.changes > 0) added.push(rel);
    }
  });
  tx();
  return { added };
}
```

- [ ] **Step 2：`src/commands/rm.ts`**

```ts
import type { Db } from '../db/index.js';
import { toRelPosix } from '../core/paths.js';
import { lookupProjectByCwd } from './save.js';
import type { Reporter } from './types.js';

export type RmOptions = { cwd: string; paths: string[] };
export async function rm(db: Db, opts: RmOptions, _reporter: Reporter): Promise<{ removed: string[] }> {
  const project = lookupProjectByCwd(db, opts.cwd);
  if (!project) throw new Error('Not in a known project.');
  const root = project.root_path_hint ?? opts.cwd;
  const stmt = db.prepare('DELETE FROM manifest_entries WHERE project_id = ? AND path = ?');
  const removed: string[] = [];
  const tx = db.transaction(() => {
    for (const p of opts.paths) {
      const rel = toRelPosix(root, p);
      const r = stmt.run(project.id, rel);
      if (r.changes > 0) removed.push(rel);
    }
  });
  tx();
  return { removed };
}
```

- [ ] **Step 3：`src/commands/ls.ts`**

```ts
import type { Db } from '../db/index.js';
import { lookupProjectByCwd } from './save.js';
import type { Reporter } from './types.js';

export type LsOptions = { cwd: string; all: boolean };
export type LsEntry = { path: string; isDir: boolean; size: number; savedAt: number };

export async function ls(db: Db, opts: LsOptions, _reporter: Reporter): Promise<LsEntry[]> {
  const project = lookupProjectByCwd(db, opts.cwd);
  if (!project) throw new Error('Not in a known project.');
  const rows = db
    .prepare(
      `SELECT mf.path AS path, mf.is_dir AS is_dir, fb.size AS size, mf.saved_at AS saved_at
       FROM managed_files mf JOIN file_blobs fb ON fb.hash = mf.blob_hash
       WHERE mf.project_id = ? ORDER BY mf.path`,
    )
    .all(project.id) as Array<{ path: string; is_dir: number; size: number; saved_at: number }>;
  return rows.map((r) => ({ path: r.path, isDir: r.is_dir === 1, size: r.size, savedAt: r.saved_at }));
}
```

- [ ] **Step 4：集成测试 `test/integration/manifest_edit.test.ts`**

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { add } from '../../src/commands/add.js';
import { init } from '../../src/commands/init.js';
import { ls } from '../../src/commands/ls.js';
import { rm } from '../../src/commands/rm.js';
import { save } from '../../src/commands/save.js';
import { openDb } from '../../src/db/index.js';
import { silentReporter } from '../helpers/reporter.js';

describe('manifest edit', () => {
  let proj: string;
  let dbPath: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'me-'));
    dbPath = join(mkdtempSync(join(tmpdir(), 'me-db-')), 't.db');
    writeFileSync(join(proj, '.env'), 'A=1');
    writeFileSync(join(proj, 'AGENTS.md'), '# a');
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it('add → save → ls → rm cycle', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: proj, alias: 'p', noScan: true, yes: true }, silentReporter());
    await add(db, { cwd: proj, paths: ['AGENTS.md'], exclude: false }, silentReporter());
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, silentReporter());
    const list = await ls(db, { cwd: proj, all: false }, silentReporter());
    expect(list.map((l) => l.path)).toEqual(['AGENTS.md']);

    await rm(db, { cwd: proj, paths: ['AGENTS.md'] }, silentReporter());
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, silentReporter());
    const list2 = await ls(db, { cwd: proj, all: false }, silentReporter());
    expect(list2).toEqual([]);
    db.close();
  });
});
```

- [ ] **Step 5：跑测试 + commit**

```bash
git add src/commands/add.ts src/commands/rm.ts src/commands/ls.ts test/integration/manifest_edit.test.ts
git commit -m "feat(commands): 添加 add / rm / ls"
```

---

### Task 3.5：commands/projects + link + rename + remove

**Files:**
- Create: `src/commands/projects.ts`
- Create: `src/commands/link.ts`
- Create: `src/commands/rename.ts`
- Create: `src/commands/remove.ts`
- Test: `test/integration/projects.test.ts`

- [ ] **Step 1：`src/commands/projects.ts`**

```ts
import type { Db } from '../db/index.js';
import type { ProjectRow } from './types.js';

export type ProjectSummary = ProjectRow & { fileCount: number; lastSaveAt: number | null };

export async function listProjects(db: Db): Promise<ProjectSummary[]> {
  const rows = db
    .prepare(
      `SELECT p.*, COALESCE(c.cnt, 0) AS fileCount, c.last AS lastSaveAt
       FROM projects p
       LEFT JOIN (
         SELECT project_id, COUNT(*) AS cnt, MAX(saved_at) AS last
         FROM managed_files GROUP BY project_id
       ) c ON c.project_id = p.id
       ORDER BY p.updated_at DESC`,
    )
    .all() as Array<ProjectRow & { fileCount: number; lastSaveAt: number | null }>;
  return rows;
}
```

- [ ] **Step 2：`src/commands/link.ts`**

```ts
import type { Db } from '../db/index.js';
import { detectProjectRoot } from '../core/project.js';
import { nowMs } from '../utils/time.js';
import type { ProjectRow, Reporter } from './types.js';

export type LinkOptions = { cwd: string; alias: string };
export async function link(db: Db, opts: LinkOptions, _reporter: Reporter): Promise<ProjectRow> {
  const proj = db
    .prepare('SELECT * FROM projects WHERE alias = ?')
    .get(opts.alias) as ProjectRow | undefined;
  if (!proj) throw new Error(`Project "${opts.alias}" not found.`);
  const { root } = detectProjectRoot(opts.cwd);
  db.prepare('UPDATE projects SET root_path_hint = ?, updated_at = ? WHERE id = ?').run(
    root,
    nowMs(),
    proj.id,
  );
  return { ...proj, root_path_hint: root };
}
```

- [ ] **Step 3：`src/commands/rename.ts`**

```ts
import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';
import type { Reporter } from './types.js';

export type RenameOptions = { oldAlias: string; newAlias: string };
export async function rename(db: Db, opts: RenameOptions, _reporter: Reporter): Promise<void> {
  const r = db
    .prepare('UPDATE projects SET alias = ?, updated_at = ? WHERE alias = ?')
    .run(opts.newAlias, nowMs(), opts.oldAlias);
  if (r.changes === 0) throw new Error(`Project "${opts.oldAlias}" not found.`);
}
```

- [ ] **Step 4：`src/commands/remove.ts`**

```ts
import { gcOrphanBlobs } from '../core/blob.js';
import type { Db } from '../db/index.js';
import type { Reporter } from './types.js';

export type RemoveOptions = { alias: string; yes: boolean };
export async function remove(db: Db, opts: RemoveOptions, reporter: Reporter): Promise<void> {
  const proj = db.prepare('SELECT id FROM projects WHERE alias = ?').get(opts.alias) as
    | { id: number }
    | undefined;
  if (!proj) throw new Error(`Project "${opts.alias}" not found.`);
  if (!opts.yes) {
    const ok = await reporter.confirm(`Permanently delete project "${opts.alias}" and all data?`);
    if (!ok) return;
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(proj.id);
  gcOrphanBlobs(db);
  reporter.success(`Removed "${opts.alias}".`);
}
```

- [ ] **Step 5：测试 `test/integration/projects.test.ts`**

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { init } from '../../src/commands/init.js';
import { link } from '../../src/commands/link.js';
import { listProjects } from '../../src/commands/projects.js';
import { remove } from '../../src/commands/remove.js';
import { rename } from '../../src/commands/rename.js';
import { openDb } from '../../src/db/index.js';
import { silentReporter } from '../helpers/reporter.js';

describe('projects mgmt', () => {
  let proj: string;
  let dbPath: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'pm-'));
    dbPath = join(mkdtempSync(join(tmpdir(), 'pm-db-')), 't.db');
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it('list/rename/remove', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: proj, alias: 'p', noScan: true, yes: true }, silentReporter());
    let all = await listProjects(db);
    expect(all.map((p) => p.alias)).toEqual(['p']);

    await rename(db, { oldAlias: 'p', newAlias: 'q' }, silentReporter());
    all = await listProjects(db);
    expect(all.map((p) => p.alias)).toEqual(['q']);

    await link(db, { cwd: proj, alias: 'q' }, silentReporter());
    await remove(db, { alias: 'q', yes: true }, silentReporter());
    all = await listProjects(db);
    expect(all).toEqual([]);
    db.close();
  });
});
```

- [ ] **Step 6：跑测试 + commit**

```bash
git add src/commands/projects.ts src/commands/link.ts src/commands/rename.ts src/commands/remove.ts test/integration/projects.test.ts
git commit -m "feat(commands): 添加 projects / link / rename / remove"
```

---

### Task 3.6：commands/status + diff

**Files:**
- Create: `src/commands/status.ts`
- Create: `src/commands/diff.ts`
- Test: `test/integration/status_diff.test.ts`

- [ ] **Step 1：`src/commands/status.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashBuffer } from '../core/blob.js';
import { expandManifest, listManifest } from '../core/manifest.js';
import type { Db } from '../db/index.js';
import { lookupProjectByCwd } from './save.js';
import type { Reporter } from './types.js';

export type StatusEntry = { path: string; state: 'unchanged' | 'changed' | 'new' | 'missing' };
export type StatusResult = { entries: StatusEntry[] };

export async function status(db: Db, opts: { cwd: string }, _r: Reporter): Promise<StatusResult> {
  const project = lookupProjectByCwd(db, opts.cwd);
  if (!project) throw new Error('Not in a known project.');
  const root = project.root_path_hint ?? opts.cwd;
  const manifest = listManifest(db, project.id);
  const expanded = expandManifest(root, manifest);
  const stored = db
    .prepare('SELECT path, blob_hash FROM managed_files WHERE project_id = ?')
    .all(project.id) as Array<{ path: string; blob_hash: string }>;
  const storedMap = new Map(stored.map((s) => [s.path, s.blob_hash]));
  const expandedMap = new Map(expanded.map((e) => [e.rel, e]));

  const entries: StatusEntry[] = [];
  for (const [rel, e] of expandedMap) {
    if (e.isDir) continue;
    const h = hashBuffer(readFileSync(e.abs));
    const stored = storedMap.get(rel);
    if (stored === undefined) entries.push({ path: rel, state: 'new' });
    else if (stored !== h) entries.push({ path: rel, state: 'changed' });
    else entries.push({ path: rel, state: 'unchanged' });
  }
  for (const [rel] of storedMap) {
    if (!expandedMap.has(rel)) {
      const abs = join(root, rel);
      entries.push({ path: rel, state: existsSync(abs) ? 'missing' : 'missing' });
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { entries };
}
```

- [ ] **Step 2：`src/commands/diff.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPatch } from 'diff';
import { getBlob, hashBuffer } from '../core/blob.js';
import type { Db } from '../db/index.js';
import { lookupProjectByCwd } from './save.js';
import type { Reporter } from './types.js';

export type DiffOptions = { cwd: string; path?: string };
export type DiffResult = { path: string; patch: string; binary: boolean }[];

export async function diff(db: Db, opts: DiffOptions, _r: Reporter): Promise<DiffResult> {
  const project = lookupProjectByCwd(db, opts.cwd);
  if (!project) throw new Error('Not in a known project.');
  const root = project.root_path_hint ?? opts.cwd;

  const where = opts.path ? 'AND path = ?' : '';
  const stmt = db.prepare(
    `SELECT path, blob_hash FROM managed_files WHERE project_id = ? ${where} ORDER BY path`,
  );
  const rows = (opts.path ? stmt.all(project.id, opts.path) : stmt.all(project.id)) as Array<{
    path: string;
    blob_hash: string;
  }>;

  const out: DiffResult = [];
  for (const r of rows) {
    const stored = getBlob(db, r.blob_hash);
    if (!stored) continue;
    let local: Buffer;
    try {
      local = readFileSync(join(root, r.path));
    } catch {
      out.push({ path: r.path, patch: '(missing locally)', binary: false });
      continue;
    }
    if (isBinary(stored) || isBinary(local)) {
      const same = hashBuffer(stored) === hashBuffer(local);
      out.push({
        path: r.path,
        patch: same ? '(binary; identical)' : `(binary; differs: ${stored.length} vs ${local.length} bytes)`,
        binary: true,
      });
      continue;
    }
    const patch = createPatch(r.path, stored.toString('utf8'), local.toString('utf8'), 'stored', 'local');
    out.push({ path: r.path, patch, binary: false });
  }
  return out;
}

function isBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8000);
  for (const b of sample) {
    if (b === 0) return true;
  }
  return false;
}
```

- [ ] **Step 3：测试 `test/integration/status_diff.test.ts`**

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diff } from '../../src/commands/diff.js';
import { init } from '../../src/commands/init.js';
import { status } from '../../src/commands/status.js';
import { openDb } from '../../src/db/index.js';
import { silentReporter } from '../helpers/reporter.js';

describe('status + diff', () => {
  let proj: string;
  let dbPath: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'sd-'));
    dbPath = join(mkdtempSync(join(tmpdir(), 'sd-db-')), 't.db');
    writeFileSync(join(proj, '.env'), 'A=1\n');
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it('detects modified file in status and emits patch in diff', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: proj, alias: 'p', noScan: false, yes: true }, silentReporter());
    writeFileSync(join(proj, '.env'), 'A=2\n');
    const s = await status(db, { cwd: proj }, silentReporter());
    expect(s.entries.find((e) => e.path === '.env')?.state).toBe('changed');

    const d = await diff(db, { cwd: proj, path: '.env' }, silentReporter());
    expect(d[0]?.patch).toMatch(/-A=1/);
    expect(d[0]?.patch).toMatch(/\+A=2/);
    db.close();
  });
});
```

- [ ] **Step 4：跑测试 + commit**

```bash
git add src/commands/status.ts src/commands/diff.ts test/integration/status_diff.test.ts
git commit -m "feat(commands): 添加 status 与 diff"
```

---

### Task 3.7：commands/rules + commands/trash + commands/doctor + commands/gc

**Files:**
- Create: `src/commands/rules.ts`
- Create: `src/commands/trash.ts`
- Create: `src/commands/doctor.ts`
- Create: `src/commands/gc.ts`
- Test: `test/integration/rules_trash_doctor.test.ts`

- [ ] **Step 1：`src/commands/rules.ts`**

```ts
import type { Db } from '../db/index.js';
import { nowMs } from '../utils/time.js';
import type { Reporter } from './types.js';

export type Rule = { id: number; pattern: string; isDefault: boolean };

export async function listRules(db: Db): Promise<Rule[]> {
  const rows = db
    .prepare('SELECT id, pattern, is_default FROM global_rules ORDER BY pattern')
    .all() as Array<{ id: number; pattern: string; is_default: number }>;
  return rows.map((r) => ({ id: r.id, pattern: r.pattern, isDefault: r.is_default === 1 }));
}

export async function addRule(db: Db, pattern: string): Promise<void> {
  db.prepare(
    `INSERT OR IGNORE INTO global_rules (pattern, is_default, created_at) VALUES (?, 0, ?)`,
  ).run(pattern, nowMs());
}

export async function removeRule(db: Db, pattern: string, _r: Reporter): Promise<void> {
  const row = db
    .prepare('SELECT is_default FROM global_rules WHERE pattern = ?')
    .get(pattern) as { is_default: number } | undefined;
  if (!row) throw new Error(`Rule "${pattern}" not found.`);
  if (row.is_default === 1) {
    throw new Error('Cannot remove a default rule. Use per-project `add --exclude` to suppress.');
  }
  db.prepare('DELETE FROM global_rules WHERE pattern = ?').run(pattern);
}
```

- [ ] **Step 2：`src/commands/trash.ts`**

```ts
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { TRASH_DIR } from '../utils/home.js';
import type { Reporter } from './types.js';

export type TrashListEntry = { id: string; alias: string; ts: string; files: string[] };

export async function trashList(filterAlias?: string): Promise<TrashListEntry[]> {
  if (!existsSync(TRASH_DIR)) return [];
  const out: TrashListEntry[] = [];
  for (const alias of readdirSync(TRASH_DIR)) {
    if (filterAlias && alias !== filterAlias) continue;
    const aliasDir = join(TRASH_DIR, alias);
    if (!statSync(aliasDir).isDirectory()) continue;
    for (const ts of readdirSync(aliasDir)) {
      const id = `${alias}/${ts}`;
      const manifestPath = join(aliasDir, ts, 'manifest.json');
      let files: string[] = [];
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
        files = (m.files ?? []).map((f: { path: string }) => f.path);
      } catch {
        /* ignore */
      }
      out.push({ id, alias, ts, files });
    }
  }
  return out.sort((a, b) => b.ts.localeCompare(a.ts));
}

export async function trashShow(id: string): Promise<TrashListEntry> {
  const [alias, ts] = id.split('/');
  if (!alias || !ts) throw new Error('Invalid trash id; expected "<alias>/<timestamp>".');
  const list = await trashList(alias);
  const entry = list.find((e) => e.ts === ts);
  if (!entry) throw new Error(`Trash entry "${id}" not found.`);
  return entry;
}

export type TrashRestoreOptions = { id: string; cwd: string; yes: boolean };
export async function trashRestore(opts: TrashRestoreOptions, reporter: Reporter): Promise<{ restored: string[] }> {
  const entry = await trashShow(opts.id);
  const root = join(TRASH_DIR, entry.alias, entry.ts);
  const restored: string[] = [];
  for (const rel of entry.files) {
    const srcAbs = join(root, rel);
    const dstAbs = join(opts.cwd, rel);
    if (existsSync(dstAbs) && !opts.yes) {
      const ok = await reporter.confirm(`"${rel}" exists locally. Overwrite?`);
      if (!ok) continue;
    }
    mkdirSync(dirname(dstAbs), { recursive: true });
    copyFileSync(srcAbs, dstAbs);
    restored.push(rel);
  }
  return { restored };
}

export async function trashClean(opts: { beforeMs?: number; yes: boolean }, reporter: Reporter): Promise<number> {
  if (!existsSync(TRASH_DIR)) return 0;
  const cutoff = opts.beforeMs;
  let removed = 0;
  for (const alias of readdirSync(TRASH_DIR)) {
    const aliasDir = join(TRASH_DIR, alias);
    for (const ts of readdirSync(aliasDir)) {
      const dir = join(aliasDir, ts);
      const stat = statSync(dir);
      if (cutoff != null && stat.mtimeMs > cutoff) continue;
      if (!opts.yes) {
        const ok = await reporter.confirm(`Delete trash "${alias}/${ts}"?`);
        if (!ok) continue;
      }
      rmSync(dir, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}
```

- [ ] **Step 3：`src/commands/doctor.ts`**

```ts
import { existsSync, statSync } from 'node:fs';
import type { Db } from '../db/index.js';
import { CONTEXTOR_DIR, DB_PATH } from '../utils/home.js';
import type { Reporter } from './types.js';

export type DoctorReport = {
  dbExists: boolean;
  dbIntegrityOk: boolean;
  dbPermOk: boolean;
  dirPermOk: boolean;
  orphanBlobs: number;
  brokenLinks: number;
};

export async function doctor(db: Db, _r: Reporter): Promise<DoctorReport> {
  const dbExists = existsSync(DB_PATH);
  const integ = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const dbIntegrityOk = integ[0]?.integrity_check === 'ok';

  const dbPermOk = dbExists ? (statSync(DB_PATH).mode & 0o777) === 0o600 : true;
  const dirPermOk = existsSync(CONTEXTOR_DIR)
    ? (statSync(CONTEXTOR_DIR).mode & 0o777) === 0o700
    : true;

  const orphanBlobs = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM file_blobs
       WHERE hash NOT IN (SELECT DISTINCT blob_hash FROM managed_files)`,
    )
    .get() as { n: number }).n;

  const brokenLinks = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM managed_files mf
       LEFT JOIN file_blobs fb ON fb.hash = mf.blob_hash
       WHERE fb.hash IS NULL`,
    )
    .get() as { n: number }).n;

  return { dbExists, dbIntegrityOk, dbPermOk, dirPermOk, orphanBlobs, brokenLinks };
}
```

- [ ] **Step 4：`src/commands/gc.ts`**

```ts
import { gcOrphanBlobs } from '../core/blob.js';
import type { Db } from '../db/index.js';
import type { Reporter } from './types.js';

export async function gc(db: Db, _r: Reporter): Promise<{ removed: number }> {
  return { removed: gcOrphanBlobs(db) };
}
```

- [ ] **Step 5：测试 `test/integration/rules_trash_doctor.test.ts`**

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addRule, listRules, removeRule } from '../../src/commands/rules.js';
import { doctor } from '../../src/commands/doctor.js';
import { openDb } from '../../src/db/index.js';
import { silentReporter } from '../helpers/reporter.js';

describe('rules + doctor', () => {
  let dbPath: string;
  beforeEach(() => {
    dbPath = join(mkdtempSync(join(tmpdir(), 'rt-')), 't.db');
  });
  afterEach(() => rmSync(dbPath, { force: true }));

  it('cannot remove default rule', async () => {
    const db = openDb(dbPath);
    await expect(removeRule(db, '.cursor/', silentReporter())).rejects.toThrow(/default/);
    db.close();
  });

  it('add+remove custom rule', async () => {
    const db = openDb(dbPath);
    await addRule(db, '.envrc');
    expect((await listRules(db)).map((r) => r.pattern)).toContain('.envrc');
    await removeRule(db, '.envrc', silentReporter());
    expect((await listRules(db)).map((r) => r.pattern)).not.toContain('.envrc');
    db.close();
  });

  it('doctor reports clean DB', async () => {
    const db = openDb(dbPath);
    const r = await doctor(db, silentReporter());
    expect(r.dbIntegrityOk).toBe(true);
    expect(r.orphanBlobs).toBe(0);
    expect(r.brokenLinks).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 6：跑测试 + commit**

```bash
git add src/commands/rules.ts src/commands/trash.ts src/commands/doctor.ts src/commands/gc.ts test/integration/rules_trash_doctor.test.ts
git commit -m "feat(commands): 添加 rules / trash / doctor / gc"
```

---

## 阶段 4：CLI 层

### Task 4.1：CLI Reporter（@inquirer/prompts 桥接）

**Files:**
- Create: `src/cli/reporter.ts`

- [ ] **Step 1：实现**

```ts
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import pc from 'picocolors';
import type { Reporter } from '../commands/types.js';

export function cliReporter(): Reporter {
  return {
    info: (m) => console.log(m),
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
        choices: choices.map((c) => ({ name: c.label, value: c.value, checked: c.checked ?? false })),
      })) as never,
    progress: (stage, current, total) => {
      console.log(pc.dim(`[${current}/${total}] ${stage}`));
    },
  };
}
```

- [ ] **Step 2：commit**

```bash
git add src/cli/reporter.ts
git commit -m "feat(cli): 添加 @inquirer/prompts 版 Reporter"
```

---

### Task 4.2：commander 路由 — 接入所有命令

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1：重写 `src/cli.ts`**

```ts
import { Command } from 'commander';
import pc from 'picocolors';
import { add as addCmd } from './commands/add.js';
import { diff as diffCmd } from './commands/diff.js';
import { doctor as doctorCmd } from './commands/doctor.js';
import { gc as gcCmd } from './commands/gc.js';
import { init as initCmd } from './commands/init.js';
import { link as linkCmd } from './commands/link.js';
import { ls as lsCmd } from './commands/ls.js';
import { listProjects } from './commands/projects.js';
import { remove as removeCmd } from './commands/remove.js';
import { rename as renameCmd } from './commands/rename.js';
import { restore as restoreCmd } from './commands/restore.js';
import { rm as rmCmd } from './commands/rm.js';
import { addRule, listRules, removeRule } from './commands/rules.js';
import { save as saveCmd } from './commands/save.js';
import { status as statusCmd } from './commands/status.js';
import { trashClean, trashList, trashRestore, trashShow } from './commands/trash.js';
import { cliReporter } from './cli/reporter.js';
import { openDb } from './db/index.js';

const program = new Command();
program.name('contextor').description('Project-level developer context sync').version('0.1.0');

const reporter = cliReporter();
const useDb = () => openDb();

program
  .command('init')
  .option('--alias <name>')
  .option('--no-scan', 'skip global-rule scan')
  .option('--yes', 'non-interactive: select all')
  .action(async (opts) => {
    const db = useDb();
    const r = await initCmd(
      db,
      { cwd: process.cwd(), alias: opts.alias, noScan: !opts.scan, yes: !!opts.yes },
      reporter,
    );
    if (r.linked) reporter.success(`Linked to existing project ${r.project.alias}.`);
    else reporter.success(`Initialized "${r.project.alias}" with ${r.saved} files saved.`);
  });

program
  .command('save')
  .option('-m, --message <msg>')
  .option('--allow-large')
  .option('--dry-run')
  .action(async (opts) => {
    const db = useDb();
    const r = await saveCmd(
      db,
      { cwd: process.cwd(), message: opts.message, allowLarge: !!opts.allowLarge, dryRun: !!opts.dryRun },
      reporter,
    );
    if (r.skippedNoChange) return;
    reporter.success(`+${r.added.length}  ~${r.modified.length}  -${r.removed.length}`);
  });

program
  .command('restore [project]')
  .option('--yes')
  .option('--no-backup')
  .option('--only <glob>')
  .option('--dry-run')
  .action(async (project, opts) => {
    const db = useDb();
    const r = await restoreCmd(
      db,
      {
        cwd: process.cwd(),
        projectAlias: project,
        yes: !!opts.yes,
        noBackup: !opts.backup,
        only: opts.only,
        dryRun: !!opts.dryRun,
      },
      reporter,
    );
    if (r.cancelled) reporter.warn('Cancelled.');
    else
      reporter.success(
        `created=${r.created.length} overwritten=${r.overwritten.length} kept=${r.keptLocal.length}` +
          (r.trashPath ? ` (backup: ${r.trashPath})` : ''),
      );
  });

program
  .command('add <paths...>')
  .option('--exclude')
  .action(async (paths, opts) => {
    const db = useDb();
    const r = await addCmd(db, { cwd: process.cwd(), paths, exclude: !!opts.exclude }, reporter);
    reporter.success(`Added ${r.added.length} entries.`);
  });

program
  .command('rm <paths...>')
  .action(async (paths) => {
    const db = useDb();
    const r = await rmCmd(db, { cwd: process.cwd(), paths }, reporter);
    reporter.success(`Removed ${r.removed.length} entries.`);
  });

program
  .command('ls')
  .option('--all')
  .action(async (opts) => {
    const db = useDb();
    const list = await lsCmd(db, { cwd: process.cwd(), all: !!opts.all }, reporter);
    for (const e of list) console.log(`${e.isDir ? 'd' : '-'} ${e.path} (${e.size}b)`);
  });

program
  .command('status')
  .action(async () => {
    const db = useDb();
    const s = await statusCmd(db, { cwd: process.cwd() }, reporter);
    for (const e of s.entries) {
      const tag = { unchanged: ' ', changed: 'M', new: '?', missing: '!' }[e.state];
      console.log(`${tag} ${e.path}`);
    }
  });

program
  .command('diff [path]')
  .action(async (path) => {
    const db = useDb();
    const d = await diffCmd(db, { cwd: process.cwd(), path }, reporter);
    for (const f of d) {
      console.log(pc.bold(f.path));
      console.log(f.patch);
    }
  });

program
  .command('projects')
  .option('--json')
  .action(async (opts) => {
    const db = useDb();
    const list = await listProjects(db);
    if (opts.json) console.log(JSON.stringify(list, null, 2));
    else
      for (const p of list)
        console.log(
          `${p.alias.padEnd(20)} ${(p.remote_url ?? '-').padEnd(40)} files=${p.fileCount}`,
        );
  });

program
  .command('link <alias>')
  .action(async (alias) => {
    const db = useDb();
    await linkCmd(db, { cwd: process.cwd(), alias }, reporter);
    reporter.success(`Linked cwd to ${alias}.`);
  });

program
  .command('rename <oldAlias> <newAlias>')
  .action(async (oldAlias, newAlias) => {
    const db = useDb();
    await renameCmd(db, { oldAlias, newAlias }, reporter);
    reporter.success(`Renamed ${oldAlias} → ${newAlias}.`);
  });

program
  .command('remove <alias>')
  .option('--yes')
  .action(async (alias, opts) => {
    const db = useDb();
    await removeCmd(db, { alias, yes: !!opts.yes }, reporter);
  });

const rules = program.command('rules').description('manage global scan rules');
rules.command('add <pattern>').action(async (p) => {
  await addRule(useDb(), p);
  reporter.success(`Added rule "${p}".`);
});
rules.command('rm <pattern>').action(async (p) => {
  await removeRule(useDb(), p, reporter);
  reporter.success(`Removed rule "${p}".`);
});
rules.action(async () => {
  for (const r of await listRules(useDb())) {
    console.log(`${r.isDefault ? '*' : ' '} ${r.pattern}`);
  }
});

const trash = program.command('trash').description('restore-time backups');
trash
  .command('list')
  .option('--project <alias>')
  .action(async (opts) => {
    for (const e of await trashList(opts.project)) {
      console.log(`${e.id}  files=${e.files.length}`);
    }
  });
trash.command('show <id>').action(async (id) => {
  const e = await trashShow(id);
  for (const f of e.files) console.log(f);
});
trash
  .command('restore <id>')
  .option('--yes')
  .action(async (id, opts) => {
    const r = await trashRestore({ id, cwd: process.cwd(), yes: !!opts.yes }, reporter);
    reporter.success(`Restored ${r.restored.length} files.`);
  });
trash
  .command('clean')
  .option('--before <duration>', 'e.g. 30d / 7d / 24h')
  .option('--yes')
  .action(async (opts) => {
    const beforeMs = opts.before ? parseDuration(opts.before) : undefined;
    const removed = await trashClean({ beforeMs, yes: !!opts.yes }, reporter);
    reporter.success(`Cleaned ${removed} entries.`);
  });

program.command('doctor').action(async () => {
  const r = await doctorCmd(useDb(), reporter);
  console.log(JSON.stringify(r, null, 2));
});
program.command('gc').action(async () => {
  const r = await gcCmd(useDb(), reporter);
  reporter.success(`GC removed ${r.removed} blobs.`);
});

// `contextor` 无参 或 `contextor --tui` → TUI 入口
program.option('--tui', 'open TUI menu');
program.action(async () => {
  const { runTui } = await import('./tui/App.js');
  await runTui();
});

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)([dhms])$/);
  if (!m) throw new Error(`Invalid duration: ${s}`);
  const n = Number.parseInt(m[1] as string, 10);
  const unit = m[2] as string;
  const mult = { d: 86400_000, h: 3600_000, m: 60_000, s: 1000 }[unit] as number;
  return Date.now() - n * mult;
}

program.parseAsync(process.argv).catch((err) => {
  reporter.error(String(err?.message ?? err));
  process.exit(1);
});
```

- [ ] **Step 2：临时打桩 `src/tui/App.ts`** （让 cli 编译通过；阶段 5 才完整实现）

```ts
export async function runTui(): Promise<void> {
  console.log('TUI not implemented yet.');
}
```

- [ ] **Step 3：lint + typecheck + test**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 全绿。

- [ ] **Step 4：commit**

```bash
git add src/cli.ts src/tui/App.ts
git commit -m "feat(cli): 接入全部命令到 commander 路由"
```

---

## 阶段 5：TUI 层

### Task 5.1：TUI Context + 共用组件

**Files:**
- Create: `src/tui/context.ts`
- Create: `src/tui/components/Confirm.tsx`
- Create: `src/tui/components/Checklist.tsx`
- Create: `src/tui/components/Progress.tsx`
- Create: `src/tui/components/DiffView.tsx`

- [ ] **Step 1：`src/tui/context.ts`**

```ts
import { createContext, useContext } from 'react';
import type { Db } from '../db/index.js';

export type TuiCtx = {
  db: Db;
  setScreen: (screen: ScreenName) => void;
  popScreen: () => void;
};

export type ScreenName =
  | 'menu' | 'init' | 'save' | 'restore' | 'add' | 'rm' | 'ls'
  | 'status' | 'diff' | 'projects' | 'link' | 'rename' | 'remove'
  | 'rules' | 'trash' | 'doctor';

export const Ctx = createContext<TuiCtx | null>(null);
export function useTui(): TuiCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('TuiCtx not provided');
  return v;
}
```

- [ ] **Step 2：`src/tui/components/Confirm.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';

export function Confirm(props: { message: string; onAnswer: (yes: boolean) => void }) {
  const [done, setDone] = useState(false);
  useInput((input, key) => {
    if (done) return;
    if (input === 'y' || input === 'Y') {
      setDone(true);
      props.onAnswer(true);
    } else if (input === 'n' || input === 'N' || key.escape || key.return) {
      setDone(true);
      props.onAnswer(false);
    }
  });
  return (
    <Box>
      <Text>{props.message} </Text>
      <Text dimColor>[y/N]</Text>
    </Box>
  );
}
```

- [ ] **Step 3：`src/tui/components/Checklist.tsx`**（自实现多选）

```tsx
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';

export type ChecklistItem<T> = { label: string; value: T; checked?: boolean };

export function Checklist<T>(props: {
  items: ChecklistItem<T>[];
  onSubmit: (chosen: T[]) => void;
  height?: number;
}) {
  const [items, setItems] = useState(() =>
    props.items.map((i) => ({ ...i, checked: i.checked ?? true })),
  );
  const [cursor, setCursor] = useState(0);
  const [done, setDone] = useState(false);

  useInput((input, key) => {
    if (done) return;
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow) setCursor((c) => Math.min(items.length - 1, c + 1));
    else if (input === ' ') {
      setItems((arr) =>
        arr.map((it, i) => (i === cursor ? { ...it, checked: !it.checked } : it)),
      );
    } else if (input === 'a') {
      setItems((arr) => arr.map((it) => ({ ...it, checked: true })));
    } else if (input === 'n') {
      setItems((arr) => arr.map((it) => ({ ...it, checked: false })));
    } else if (key.return) {
      setDone(true);
      props.onSubmit(items.filter((it) => it.checked).map((it) => it.value));
    }
  });

  const visible = items.slice(0, props.height ?? 20);
  return (
    <Box flexDirection="column">
      {visible.map((it, i) => (
        <Text key={i} color={i === cursor ? 'cyan' : undefined}>
          {i === cursor ? '> ' : '  '}[{it.checked ? 'x' : ' '}] {it.label}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ move · space toggle · a all · n none · enter confirm</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4：`src/tui/components/Progress.tsx`**

```tsx
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export function Progress(props: { stage: string; current: number; total: number }) {
  return (
    <Box>
      <Spinner type="dots" />
      <Text> {props.stage} ({props.current}/{props.total})</Text>
    </Box>
  );
}
```

- [ ] **Step 5：`src/tui/components/DiffView.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';

export function DiffView(props: { patch: string; onExit: () => void; height?: number }) {
  const lines = props.patch.split('\n');
  const [top, setTop] = useState(0);
  const h = props.height ?? 20;
  useInput((_input, key) => {
    if (key.escape) props.onExit();
    else if (key.downArrow) setTop((t) => Math.min(lines.length - h, t + 1));
    else if (key.upArrow) setTop((t) => Math.max(0, t - 1));
    else if (key.pageDown) setTop((t) => Math.min(lines.length - h, t + h));
    else if (key.pageUp) setTop((t) => Math.max(0, t - h));
  });
  return (
    <Box flexDirection="column">
      {lines.slice(top, top + h).map((l, i) => (
        <Text
          key={i}
          color={l.startsWith('+') ? 'green' : l.startsWith('-') ? 'red' : undefined}
          dimColor={l.startsWith('@@')}
        >
          {l}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ pgUp/pgDn · esc to back</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 6：lint + commit**

```bash
git add src/tui/context.ts src/tui/components
git commit -m "feat(tui): 共用组件（Confirm / Checklist / Progress / DiffView）"
```

---

### Task 5.2：TUI Reporter（ink 桥接）

**Files:**
- Create: `src/tui/reporter.tsx`

> 设计：用一个全局 EventEmitter 把 commands 层的 reporter 调用桥接到当前 Screen。Screen 用 hook 订阅。
> 简化方案：每个需要交互的 Screen 自己用本地组件状态驱动 reporter 回调（用 Promise + setState）。
> 因此 reporter.tsx 只提供"非交互"方法 + 工厂返回部分实现，交互方法（confirm/multiSelect/selectOne/prompt）由各 Screen 注入回调实现。

- [ ] **Step 1：实现**

```tsx
import type { Reporter } from '../commands/types.js';

export type InteractiveBridge = {
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, def?: string) => Promise<string>;
  selectOne: <T>(message: string, choices: { label: string; value: T }[]) => Promise<T>;
  multiSelect: <T>(
    message: string,
    choices: { label: string; value: T; checked?: boolean }[],
  ) => Promise<T[]>;
};

export type Sink = {
  log: (line: string, kind?: 'info' | 'warn' | 'success' | 'error') => void;
  progress?: (stage: string, current: number, total: number) => void;
};

export function tuiReporter(sink: Sink, bridge: InteractiveBridge): Reporter {
  return {
    info: (m) => sink.log(m, 'info'),
    warn: (m) => sink.log(m, 'warn'),
    success: (m) => sink.log(m, 'success'),
    error: (m) => sink.log(m, 'error'),
    confirm: bridge.confirm,
    prompt: bridge.prompt,
    selectOne: async (msg, choices) => bridge.selectOne(msg, choices) as never,
    multiSelect: async (msg, choices) => bridge.multiSelect(msg, choices) as never,
    progress: sink.progress,
  };
}
```

- [ ] **Step 2：commit**

```bash
git add src/tui/reporter.tsx
git commit -m "feat(tui): Reporter 桥接（log + 交互 bridge 注入）"
```

---

### Task 5.3：MainMenu + App 根组件

**Files:**
- Modify: `src/tui/App.tsx`（替换 Task 4.2 的桩）
- Create: `src/tui/screens/MainMenu.tsx`

- [ ] **Step 1：删除桩 `src/tui/App.ts`**

```bash
rm src/tui/App.ts
```

- [ ] **Step 2：`src/tui/screens/MainMenu.tsx`**

> §6.4 要求：cwd 不在已知项目里时，`save / status / diff / add / rm / ls` 变灰禁用。
> 实现：先尝试 `lookupProjectByCwd` 判断当前是否在已知项目中；若否，过滤掉这些项并在顶部提示。

```tsx
import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { useEffect, useState } from 'react';
import { lookupProjectByCwd } from '../../commands/save.js';
import type { ProjectRow } from '../../commands/types.js';
import { useTui } from '../context.js';

const PROJECT_BOUND = new Set(['save', 'add', 'rm', 'ls', 'status', 'diff']);

const ALL_ITEMS = [
  { label: 'init       初始化当前目录', value: 'init' },
  { label: 'save       保存当前项目配置', value: 'save' },
  { label: 'restore    还原项目配置', value: 'restore' },
  { label: 'add        添加文件到管理', value: 'add' },
  { label: 'rm         移除文件', value: 'rm' },
  { label: 'ls         查看受管文件', value: 'ls' },
  { label: 'status     查看状态', value: 'status' },
  { label: 'diff       查看差异', value: 'diff' },
  { label: '────────', value: '__sep__' },
  { label: 'projects   管理所有项目', value: 'projects' },
  { label: 'link       绑定到已有项目', value: 'link' },
  { label: 'rules      管理全局规则', value: 'rules' },
  { label: 'trash      回收站', value: 'trash' },
  { label: 'doctor     系统自检', value: 'doctor' },
  { label: 'quit', value: 'quit' },
] as const;

export function MainMenu() {
  const { db, setScreen } = useTui();
  const { exit } = useApp();
  const [project, setProject] = useState<ProjectRow | null | 'unknown'>('unknown');
  useEffect(() => {
    setProject(lookupProjectByCwd(db, process.cwd()));
  }, []);
  useInput((input) => {
    if (input === 'q') exit();
  });

  const inProject = project !== 'unknown' && project != null;
  const items = ALL_ITEMS.filter((it) => inProject || !PROJECT_BOUND.has(it.value));

  return (
    <Box flexDirection="column">
      <Text>contextor</Text>
      {inProject ? (
        <Text dimColor>
          Current project: {(project as ProjectRow).alias}{' '}
          {(project as ProjectRow).remote_url
            ? `(origin: ${(project as ProjectRow).remote_url})`
            : ''}
        </Text>
      ) : (
        <Text dimColor>Not in a known project. `init` to register, or `cd` first.</Text>
      )}
      <Text dimColor>───────────────────────────────</Text>
      <SelectInput
        items={items as unknown as Array<{ label: string; value: string }>}
        onSelect={(item) => {
          if (item.value === 'quit') exit();
          else if (item.value !== '__sep__') setScreen(item.value as never);
        }}
      />
    </Box>
  );
}
```

- [ ] **Step 3：`src/tui/App.tsx`**

```tsx
import { render } from 'ink';
import { useState } from 'react';
import { openDb } from '../db/index.js';
import { Ctx, type ScreenName } from './context.js';
import { MainMenu } from './screens/MainMenu.js';
import { ScreenInit } from './screens/ScreenInit.js';
import { ScreenSave } from './screens/ScreenSave.js';
import { ScreenRestore } from './screens/ScreenRestore.js';
import { ScreenStatus } from './screens/ScreenStatus.js';
import { ScreenLs } from './screens/ScreenLs.js';
import { ScreenAdd } from './screens/ScreenAdd.js';
import { ScreenRm } from './screens/ScreenRm.js';
import { ScreenDiff } from './screens/ScreenDiff.js';
import { ScreenProjects } from './screens/ScreenProjects.js';
import { ScreenLink } from './screens/ScreenLink.js';
import { ScreenRename } from './screens/ScreenRename.js';
import { ScreenRemove } from './screens/ScreenRemove.js';
import { ScreenRules } from './screens/ScreenRules.js';
import { ScreenTrash } from './screens/ScreenTrash.js';
import { ScreenDoctor } from './screens/ScreenDoctor.js';

function App() {
  const [stack, setStack] = useState<ScreenName[]>(['menu']);
  const top = stack[stack.length - 1] as ScreenName;
  const ctxValue = {
    db: openDb(),
    setScreen: (s: ScreenName) => setStack((arr) => [...arr, s]),
    popScreen: () => setStack((arr) => (arr.length > 1 ? arr.slice(0, -1) : arr)),
  };
  return (
    <Ctx.Provider value={ctxValue}>
      {top === 'menu' && <MainMenu />}
      {top === 'init' && <ScreenInit />}
      {top === 'save' && <ScreenSave />}
      {top === 'restore' && <ScreenRestore />}
      {top === 'status' && <ScreenStatus />}
      {top === 'ls' && <ScreenLs />}
      {top === 'add' && <ScreenAdd />}
      {top === 'rm' && <ScreenRm />}
      {top === 'diff' && <ScreenDiff />}
      {top === 'projects' && <ScreenProjects />}
      {top === 'link' && <ScreenLink />}
      {top === 'rename' && <ScreenRename />}
      {top === 'remove' && <ScreenRemove />}
      {top === 'rules' && <ScreenRules />}
      {top === 'trash' && <ScreenTrash />}
      {top === 'doctor' && <ScreenDoctor />}
    </Ctx.Provider>
  );
}

export async function runTui(): Promise<void> {
  const inst = render(<App />);
  await inst.waitUntilExit();
}
```

- [ ] **Step 4：commit**（此时若直接 typecheck 会报缺 Screen 模块；先 commit 这两个文件，后续 Task 逐步补 Screen）

> 实操建议：把所有 Screen 文件先创建为最小占位，再逐个填充逻辑，避免 typecheck 中断。

```bash
git add src/tui/App.tsx src/tui/screens/MainMenu.tsx
git rm src/tui/App.ts
git commit -m "feat(tui): App 根 + MainMenu（Screen 占位待补）"
```

- [ ] **Step 5：批量创建 Screen 占位**

为下列文件各创建一个最小占位组件：

`src/tui/screens/ScreenInit.tsx`、`ScreenSave.tsx`、`ScreenRestore.tsx`、`ScreenStatus.tsx`、`ScreenLs.tsx`、`ScreenAdd.tsx`、`ScreenRm.tsx`、`ScreenDiff.tsx`、`ScreenProjects.tsx`、`ScreenLink.tsx`、`ScreenRename.tsx`、`ScreenRemove.tsx`、`ScreenRules.tsx`、`ScreenTrash.tsx`、`ScreenDoctor.tsx`

每个文件内容（替换 `XXX` 为对应名字）：

```tsx
import { Box, Text, useInput } from 'ink';
import { useTui } from '../context.js';

export function ScreenXXX() {
  const { popScreen } = useTui();
  useInput((_i, k) => {
    if (k.escape) popScreen();
  });
  return (
    <Box flexDirection="column">
      <Text color="yellow">XXX (todo)</Text>
      <Text dimColor>esc to back</Text>
    </Box>
  );
}
```

Run: `pnpm typecheck`
Expected: 通过。

- [ ] **Step 6：commit**

```bash
git add src/tui/screens
git commit -m "feat(tui): Screen 占位组件批量创建"
```

---

### Task 5.4：ScreenInit / ScreenSave / ScreenRestore（核心三屏）

**Files:**
- Modify: `src/tui/screens/ScreenInit.tsx`
- Modify: `src/tui/screens/ScreenSave.tsx`
- Modify: `src/tui/screens/ScreenRestore.tsx`

> 模式：每个 Screen 用本地状态机驱动业务逻辑。把 `multiSelect` / `confirm` 通过 Promise 与组件交互桥接（在组件状态里保存 resolver）。

- [ ] **Step 1：完整实现 `ScreenInit.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { init } from '../../commands/init.js';
import { tuiReporter, type InteractiveBridge } from '../reporter.js';
import { useTui } from '../context.js';
import { Checklist } from '../components/Checklist.js';

type Phase =
  | { kind: 'idle' }
  | { kind: 'multiselect'; message: string; items: { label: string; value: string }[]; resolve: (v: string[]) => void }
  | { kind: 'done'; summary: string }
  | { kind: 'error'; message: string };

export function ScreenInit() {
  const { db, popScreen } = useTui();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [logs, setLogs] = useState<string[]>([]);

  useInput((_i, k) => {
    if ((phase.kind === 'done' || phase.kind === 'error') && k.escape) popScreen();
  });

  useEffect(() => {
    const bridge: InteractiveBridge = {
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(''),
      selectOne: () => Promise.reject(new Error('selectOne not used here')),
      multiSelect: (message, items) =>
        new Promise((resolve) =>
          setPhase({
            kind: 'multiselect',
            message,
            items: items.map((i) => ({ label: i.label, value: String(i.value) })),
            resolve: (vs) => resolve(vs as never),
          }),
        ),
    };
    const reporter = tuiReporter(
      { log: (line) => setLogs((l) => [...l, line]) },
      bridge,
    );
    init(db, { cwd: process.cwd(), noScan: false, yes: false }, reporter)
      .then((r) =>
        setPhase({
          kind: 'done',
          summary: r.linked
            ? `Linked to ${r.project.alias}`
            : `Created ${r.project.alias}, saved ${r.saved} files.`,
        }),
      )
      .catch((e) => setPhase({ kind: 'error', message: String(e?.message ?? e) }));
  }, []);

  return (
    <Box flexDirection="column">
      <Text>init</Text>
      {logs.map((l, i) => (
        <Text key={i} dimColor>
          {l}
        </Text>
      ))}
      {phase.kind === 'multiselect' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>{phase.message}</Text>
          <Checklist items={phase.items} onSubmit={(vs) => phase.resolve(vs)} />
        </Box>
      )}
      {phase.kind === 'done' && (
        <Box marginTop={1}>
          <Text color="green">✓ {phase.summary}</Text>
        </Box>
      )}
      {phase.kind === 'error' && (
        <Box marginTop={1}>
          <Text color="red">✗ {phase.message}</Text>
        </Box>
      )}
      {(phase.kind === 'done' || phase.kind === 'error') && (
        <Text dimColor>esc to back</Text>
      )}
    </Box>
  );
}
```

- [ ] **Step 2：完整实现 `ScreenSave.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { save } from '../../commands/save.js';
import { tuiReporter, type InteractiveBridge } from '../reporter.js';
import { useTui } from '../context.js';

export function ScreenSave() {
  const { db, popScreen } = useTui();
  const [done, setDone] = useState<{ ok: boolean; summary: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useInput((_i, k) => {
    if (done && k.escape) popScreen();
  });

  useEffect(() => {
    const bridge: InteractiveBridge = {
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(''),
      selectOne: () => Promise.reject(new Error('n/a')),
      multiSelect: () => Promise.reject(new Error('n/a')),
    };
    const reporter = tuiReporter({ log: (l) => setLogs((p) => [...p, l]) }, bridge);
    save(db, { cwd: process.cwd(), allowLarge: false, dryRun: false }, reporter)
      .then((r) =>
        setDone({
          ok: true,
          summary: r.skippedNoChange
            ? 'No changes.'
            : `+${r.added.length} ~${r.modified.length} -${r.removed.length}`,
        }),
      )
      .catch((e) => setDone({ ok: false, summary: String(e?.message ?? e) }));
  }, []);

  return (
    <Box flexDirection="column">
      <Text>save</Text>
      {logs.map((l, i) => (
        <Text key={i} dimColor>
          {l}
        </Text>
      ))}
      {done && (
        <Box marginTop={1} flexDirection="column">
          <Text color={done.ok ? 'green' : 'red'}>
            {done.ok ? '✓ ' : '✗ '}
            {done.summary}
          </Text>
          <Text dimColor>esc to back</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 3：完整实现 `ScreenRestore.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { restore } from '../../commands/restore.js';
import { tuiReporter, type InteractiveBridge } from '../reporter.js';
import { useTui } from '../context.js';
import { Confirm } from '../components/Confirm.js';

type Phase =
  | { kind: 'running' }
  | { kind: 'confirm'; message: string; resolve: (v: boolean) => void }
  | { kind: 'done'; ok: boolean; summary: string };

export function ScreenRestore() {
  const { db, popScreen } = useTui();
  const [phase, setPhase] = useState<Phase>({ kind: 'running' });
  const [logs, setLogs] = useState<string[]>([]);

  useInput((_i, k) => {
    if (phase.kind === 'done' && k.escape) popScreen();
  });

  useEffect(() => {
    const bridge: InteractiveBridge = {
      confirm: (message) =>
        new Promise((resolve) => setPhase({ kind: 'confirm', message, resolve })),
      prompt: () => Promise.resolve(''),
      selectOne: () => Promise.reject(new Error('n/a — use --alias for now')),
      multiSelect: () => Promise.reject(new Error('n/a')),
    };
    const reporter = tuiReporter({ log: (l) => setLogs((p) => [...p, l]) }, bridge);
    restore(db, { cwd: process.cwd(), yes: false, noBackup: false, dryRun: false }, reporter)
      .then((r) =>
        setPhase({
          kind: 'done',
          ok: !r.cancelled,
          summary: r.cancelled
            ? 'Cancelled.'
            : `created=${r.created.length} overwritten=${r.overwritten.length} kept=${r.keptLocal.length}`,
        }),
      )
      .catch((e) => setPhase({ kind: 'done', ok: false, summary: String(e?.message ?? e) }));
  }, []);

  return (
    <Box flexDirection="column">
      <Text>restore</Text>
      {logs.map((l, i) => (
        <Text key={i} dimColor>
          {l}
        </Text>
      ))}
      {phase.kind === 'confirm' && (
        <Box marginTop={1}>
          <Confirm
            message={phase.message}
            onAnswer={(yes) => {
              setPhase({ kind: 'running' });
              phase.resolve(yes);
            }}
          />
        </Box>
      )}
      {phase.kind === 'done' && (
        <Box marginTop={1} flexDirection="column">
          <Text color={phase.ok ? 'green' : 'red'}>
            {phase.ok ? '✓ ' : '✗ '}
            {phase.summary}
          </Text>
          <Text dimColor>esc to back</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 4：commit**

```bash
git add src/tui/screens/ScreenInit.tsx src/tui/screens/ScreenSave.tsx src/tui/screens/ScreenRestore.tsx
git commit -m "feat(tui): 实现 ScreenInit / ScreenSave / ScreenRestore"
```

---

### Task 5.5：剩余 Screen — 列表/简单输入风格

每个 Screen 都是同一种模式：`useEffect` 调对应 command → 在状态里存结果 → 渲染列表 → `esc` 返回。下面给出每个 Screen 的完整实现，避免阅读跳跃。

**Files:**
- Modify: `src/tui/screens/ScreenStatus.tsx`
- Modify: `src/tui/screens/ScreenLs.tsx`
- Modify: `src/tui/screens/ScreenAdd.tsx`
- Modify: `src/tui/screens/ScreenRm.tsx`
- Modify: `src/tui/screens/ScreenDiff.tsx`
- Modify: `src/tui/screens/ScreenProjects.tsx`
- Modify: `src/tui/screens/ScreenLink.tsx`
- Modify: `src/tui/screens/ScreenRename.tsx`
- Modify: `src/tui/screens/ScreenRemove.tsx`
- Modify: `src/tui/screens/ScreenRules.tsx`
- Modify: `src/tui/screens/ScreenTrash.tsx`
- Modify: `src/tui/screens/ScreenDoctor.tsx`

- [ ] **Step 1：`ScreenStatus.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { status, type StatusEntry } from '../../commands/status.js';
import { tuiReporter } from '../reporter.js';
import { useTui } from '../context.js';

export function ScreenStatus() {
  const { db, popScreen } = useTui();
  const [list, setList] = useState<StatusEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useInput((_i, k) => k.escape && popScreen());
  useEffect(() => {
    const r = tuiReporter({ log: () => {} }, {
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(''),
      selectOne: () => Promise.reject(new Error('n/a')),
      multiSelect: () => Promise.reject(new Error('n/a')),
    });
    status(db, { cwd: process.cwd() }, r)
      .then((s) => setList(s.entries))
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  return (
    <Box flexDirection="column">
      <Text>status</Text>
      {err && <Text color="red">{err}</Text>}
      {list.map((e, i) => (
        <Text key={i} color={tagColor(e.state)}>
          {tag(e.state)} {e.path}
        </Text>
      ))}
      <Text dimColor>esc to back</Text>
    </Box>
  );
}
function tag(s: StatusEntry['state']): string {
  return { unchanged: ' ', changed: 'M', new: '?', missing: '!' }[s];
}
function tagColor(s: StatusEntry['state']): string | undefined {
  return { unchanged: undefined, changed: 'yellow', new: 'cyan', missing: 'red' }[s];
}
```

- [ ] **Step 2：`ScreenLs.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { ls, type LsEntry } from '../../commands/ls.js';
import { tuiReporter } from '../reporter.js';
import { useTui } from '../context.js';

export function ScreenLs() {
  const { db, popScreen } = useTui();
  const [items, setItems] = useState<LsEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useInput((_i, k) => k.escape && popScreen());
  useEffect(() => {
    const r = tuiReporter({ log: () => {} }, {
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(''),
      selectOne: () => Promise.reject(new Error('n/a')),
      multiSelect: () => Promise.reject(new Error('n/a')),
    });
    ls(db, { cwd: process.cwd(), all: false }, r)
      .then(setItems)
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);
  return (
    <Box flexDirection="column">
      <Text>ls</Text>
      {err && <Text color="red">{err}</Text>}
      {items.map((it, i) => (
        <Text key={i}>
          {it.isDir ? 'd' : '-'} {it.path} ({it.size}b)
        </Text>
      ))}
      <Text dimColor>esc to back</Text>
    </Box>
  );
}
```

- [ ] **Step 3：`ScreenAdd.tsx` + `ScreenRm.tsx`**（用 ink-text-input 收单行）

```tsx
// ScreenAdd.tsx
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { add } from '../../commands/add.js';
import { useTui } from '../context.js';
import { tuiReporter } from '../reporter.js';

export function ScreenAdd() {
  const { db, popScreen } = useTui();
  const [val, setVal] = useState('');
  const [done, setDone] = useState<string | null>(null);
  useInput((_i, k) => done && k.escape && popScreen());
  return (
    <Box flexDirection="column">
      <Text>add (path or pattern, comma-separated)</Text>
      <TextInput
        value={val}
        onChange={setVal}
        onSubmit={async (input) => {
          const paths = input.split(',').map((s) => s.trim()).filter(Boolean);
          const r = tuiReporter({ log: () => {} }, {
            confirm: () => Promise.resolve(true),
            prompt: () => Promise.resolve(''),
            selectOne: () => Promise.reject(new Error('n/a')),
            multiSelect: () => Promise.reject(new Error('n/a')),
          });
          try {
            const res = await add(db, { cwd: process.cwd(), paths, exclude: false }, r);
            setDone(`Added ${res.added.length} entries.`);
          } catch (e) {
            setDone(`Error: ${(e as Error).message}`);
          }
        }}
      />
      {done && <Text color="green">{done}</Text>}
      <Text dimColor>enter submit · esc back (after done)</Text>
    </Box>
  );
}
```

```tsx
// ScreenRm.tsx —— 同上结构，调 rm()
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { rm } from '../../commands/rm.js';
import { useTui } from '../context.js';
import { tuiReporter } from '../reporter.js';

export function ScreenRm() {
  const { db, popScreen } = useTui();
  const [val, setVal] = useState('');
  const [done, setDone] = useState<string | null>(null);
  useInput((_i, k) => done && k.escape && popScreen());
  return (
    <Box flexDirection="column">
      <Text>rm (path, comma-separated)</Text>
      <TextInput
        value={val}
        onChange={setVal}
        onSubmit={async (input) => {
          const paths = input.split(',').map((s) => s.trim()).filter(Boolean);
          const r = tuiReporter({ log: () => {} }, {
            confirm: () => Promise.resolve(true),
            prompt: () => Promise.resolve(''),
            selectOne: () => Promise.reject(new Error('n/a')),
            multiSelect: () => Promise.reject(new Error('n/a')),
          });
          try {
            const res = await rm(db, { cwd: process.cwd(), paths }, r);
            setDone(`Removed ${res.removed.length} entries.`);
          } catch (e) {
            setDone(`Error: ${(e as Error).message}`);
          }
        }}
      />
      {done && <Text color="green">{done}</Text>}
      <Text dimColor>enter submit · esc back (after done)</Text>
    </Box>
  );
}
```

- [ ] **Step 4：`ScreenDiff.tsx`**（先列文件，再展开 patch）

```tsx
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { useEffect, useState } from 'react';
import { diff, type DiffResult } from '../../commands/diff.js';
import { useTui } from '../context.js';
import { tuiReporter } from '../reporter.js';
import { DiffView } from '../components/DiffView.js';

export function ScreenDiff() {
  const { db, popScreen } = useTui();
  const [list, setList] = useState<DiffResult>([]);
  const [picked, setPicked] = useState<string | null>(null);
  useInput((_i, k) => k.escape && (picked ? setPicked(null) : popScreen()));
  useEffect(() => {
    const r = tuiReporter({ log: () => {} }, {
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(''),
      selectOne: () => Promise.reject(new Error('n/a')),
      multiSelect: () => Promise.reject(new Error('n/a')),
    });
    diff(db, { cwd: process.cwd() }, r)
      .then(setList)
      .catch(() => setList([]));
  }, []);
  if (picked) {
    const f = list.find((x) => x.path === picked)!;
    return <DiffView patch={f.patch} onExit={() => setPicked(null)} />;
  }
  return (
    <Box flexDirection="column">
      <Text>diff — pick a file</Text>
      <SelectInput
        items={list.map((f) => ({ label: f.path, value: f.path }))}
        onSelect={(it) => setPicked(it.value as string)}
      />
      <Text dimColor>esc back</Text>
    </Box>
  );
}
```

- [ ] **Step 5：`ScreenProjects.tsx`** + `ScreenLink/Rename/Remove`

```tsx
// ScreenProjects.tsx
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { listProjects, type ProjectSummary } from '../../commands/projects.js';
import { useTui } from '../context.js';

export function ScreenProjects() {
  const { db, popScreen, setScreen } = useTui();
  const [items, setItems] = useState<ProjectSummary[]>([]);
  useInput((input, k) => {
    if (k.escape) popScreen();
    if (input === 'l') setScreen('link');
    if (input === 'r') setScreen('rename');
    if (input === 'd') setScreen('remove');
  });
  useEffect(() => {
    listProjects(db).then(setItems);
  }, []);
  return (
    <Box flexDirection="column">
      <Text>projects</Text>
      {items.map((p, i) => (
        <Text key={i}>
          {p.alias.padEnd(20)} {p.remote_url ?? '-'} files={p.fileCount}
        </Text>
      ))}
      <Text dimColor>l link · r rename · d remove · esc back</Text>
    </Box>
  );
}
```

```tsx
// ScreenLink.tsx
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { link } from '../../commands/link.js';
import { useTui } from '../context.js';
import { tuiReporter } from '../reporter.js';

export function ScreenLink() {
  const { db, popScreen } = useTui();
  const [val, setVal] = useState('');
  const [done, setDone] = useState<string | null>(null);
  useInput((_i, k) => done && k.escape && popScreen());
  return (
    <Box flexDirection="column">
      <Text>link cwd → existing project alias</Text>
      <TextInput
        value={val}
        onChange={setVal}
        onSubmit={async (alias) => {
          const r = tuiReporter({ log: () => {} }, {
            confirm: () => Promise.resolve(true),
            prompt: () => Promise.resolve(''),
            selectOne: () => Promise.reject(new Error('n/a')),
            multiSelect: () => Promise.reject(new Error('n/a')),
          });
          try {
            await link(db, { cwd: process.cwd(), alias }, r);
            setDone(`Linked to ${alias}.`);
          } catch (e) {
            setDone(`Error: ${(e as Error).message}`);
          }
        }}
      />
      {done && <Text color="green">{done}</Text>}
      <Text dimColor>esc back (after done)</Text>
    </Box>
  );
}
```

```tsx
// ScreenRename.tsx
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { rename } from '../../commands/rename.js';
import { useTui } from '../context.js';
import { tuiReporter } from '../reporter.js';

export function ScreenRename() {
  const { db, popScreen } = useTui();
  const [step, setStep] = useState<'old' | 'new'>('old');
  const [oldA, setOldA] = useState('');
  const [newA, setNewA] = useState('');
  const [done, setDone] = useState<string | null>(null);
  useInput((_i, k) => done && k.escape && popScreen());
  return (
    <Box flexDirection="column">
      <Text>rename project</Text>
      {step === 'old' && (
        <Box>
          <Text>old: </Text>
          <TextInput value={oldA} onChange={setOldA} onSubmit={() => setStep('new')} />
        </Box>
      )}
      {step === 'new' && !done && (
        <Box>
          <Text>new: </Text>
          <TextInput
            value={newA}
            onChange={setNewA}
            onSubmit={async () => {
              const r = tuiReporter({ log: () => {} }, {
                confirm: () => Promise.resolve(true),
                prompt: () => Promise.resolve(''),
                selectOne: () => Promise.reject(new Error('n/a')),
                multiSelect: () => Promise.reject(new Error('n/a')),
              });
              try {
                await rename(db, { oldAlias: oldA, newAlias: newA }, r);
                setDone(`Renamed ${oldA} → ${newA}.`);
              } catch (e) {
                setDone(`Error: ${(e as Error).message}`);
              }
            }}
          />
        </Box>
      )}
      {done && <Text color="green">{done}</Text>}
      <Text dimColor>enter next/submit · esc back (after done)</Text>
    </Box>
  );
}
```

```tsx
// ScreenRemove.tsx
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { remove } from '../../commands/remove.js';
import { Confirm } from '../components/Confirm.js';
import { useTui } from '../context.js';
import { tuiReporter } from '../reporter.js';

export function ScreenRemove() {
  const { db, popScreen } = useTui();
  const [alias, setAlias] = useState('');
  const [phase, setPhase] = useState<'input' | 'confirm' | 'done'>('input');
  const [confirmRes, setConfirmRes] = useState<((v: boolean) => void) | null>(null);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [done, setDone] = useState<string | null>(null);
  useInput((_i, k) => phase === 'done' && k.escape && popScreen());
  const run = async (input: string) => {
    const r = tuiReporter({ log: () => {} }, {
      confirm: (msg) => new Promise((res) => {
        setConfirmMsg(msg);
        setPhase('confirm');
        setConfirmRes(() => (v: boolean) => res(v));
      }),
      prompt: () => Promise.resolve(''),
      selectOne: () => Promise.reject(new Error('n/a')),
      multiSelect: () => Promise.reject(new Error('n/a')),
    });
    try {
      await remove(db, { alias: input, yes: false }, r);
      setDone(`Removed ${input}.`);
    } catch (e) {
      setDone(`Error: ${(e as Error).message}`);
    }
    setPhase('done');
  };
  return (
    <Box flexDirection="column">
      <Text>remove project (irreversible)</Text>
      {phase === 'input' && (
        <Box>
          <Text>alias: </Text>
          <TextInput value={alias} onChange={setAlias} onSubmit={(v) => run(v)} />
        </Box>
      )}
      {phase === 'confirm' && (
        <Confirm message={confirmMsg} onAnswer={(v) => confirmRes?.(v)} />
      )}
      {phase === 'done' && done && <Text color="green">{done}</Text>}
      <Text dimColor>esc back (after done)</Text>
    </Box>
  );
}
```

- [ ] **Step 6：`ScreenRules.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { addRule, listRules, removeRule, type Rule } from '../../commands/rules.js';
import { useTui } from '../context.js';
import TextInput from 'ink-text-input';
import { tuiReporter } from '../reporter.js';

export function ScreenRules() {
  const { db, popScreen } = useTui();
  const [rules, setRules] = useState<Rule[]>([]);
  const [mode, setMode] = useState<'view' | 'add' | 'rm'>('view');
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useInput((input, k) => {
    if (mode === 'view') {
      if (k.escape) popScreen();
      if (input === 'a') setMode('add');
      if (input === 'r') setMode('rm');
    }
  });

  const reload = () => listRules(db).then(setRules);
  useEffect(() => {
    reload();
  }, []);

  const reporter = tuiReporter({ log: () => {} }, {
    confirm: () => Promise.resolve(true),
    prompt: () => Promise.resolve(''),
    selectOne: () => Promise.reject(new Error('n/a')),
    multiSelect: () => Promise.reject(new Error('n/a')),
  });

  return (
    <Box flexDirection="column">
      <Text>rules ({rules.length})</Text>
      {rules.map((r, i) => (
        <Text key={i}>
          {r.isDefault ? '*' : ' '} {r.pattern}
        </Text>
      ))}
      {mode === 'add' && (
        <Box>
          <Text>add: </Text>
          <TextInput
            value={val}
            onChange={setVal}
            onSubmit={async (p) => {
              await addRule(db, p);
              setMsg(`Added ${p}`);
              setVal('');
              setMode('view');
              await reload();
            }}
          />
        </Box>
      )}
      {mode === 'rm' && (
        <Box>
          <Text>rm: </Text>
          <TextInput
            value={val}
            onChange={setVal}
            onSubmit={async (p) => {
              try {
                await removeRule(db, p, reporter);
                setMsg(`Removed ${p}`);
              } catch (e) {
                setMsg((e as Error).message);
              }
              setVal('');
              setMode('view');
              await reload();
            }}
          />
        </Box>
      )}
      {msg && <Text color="cyan">{msg}</Text>}
      <Text dimColor>a add · r rm · esc back</Text>
    </Box>
  );
}
```

- [ ] **Step 7：`ScreenTrash.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { trashList, trashRestore, trashClean, type TrashListEntry } from '../../commands/trash.js';
import { useTui } from '../context.js';
import { tuiReporter } from '../reporter.js';

export function ScreenTrash() {
  const { popScreen } = useTui();
  const [items, setItems] = useState<TrashListEntry[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const reload = () => trashList().then(setItems);
  useEffect(() => {
    reload();
  }, []);
  const reporter = tuiReporter({ log: () => {} }, {
    confirm: () => Promise.resolve(true),
    prompt: () => Promise.resolve(''),
    selectOne: () => Promise.reject(new Error('n/a')),
    multiSelect: () => Promise.reject(new Error('n/a')),
  });
  useInput(async (input, k) => {
    if (k.escape) return popScreen();
    if (input === 'c') {
      const removed = await trashClean({ yes: true }, reporter);
      setMsg(`Cleaned ${removed} entries.`);
      await reload();
    }
    if (input === 'r' && items[0]) {
      const r = await trashRestore({ id: items[0].id, cwd: process.cwd(), yes: true }, reporter);
      setMsg(`Restored ${r.restored.length} files from ${items[0].id}.`);
    }
  });
  return (
    <Box flexDirection="column">
      <Text>trash ({items.length})</Text>
      {items.map((e, i) => (
        <Text key={i}>{e.id} files={e.files.length}</Text>
      ))}
      {msg && <Text color="cyan">{msg}</Text>}
      <Text dimColor>r restore latest · c clean all · esc back</Text>
    </Box>
  );
}
```

- [ ] **Step 8：`ScreenDoctor.tsx`**

```tsx
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { doctor, type DoctorReport } from '../../commands/doctor.js';
import { useTui } from '../context.js';
import { tuiReporter } from '../reporter.js';

export function ScreenDoctor() {
  const { db, popScreen } = useTui();
  const [r, setR] = useState<DoctorReport | null>(null);
  useInput((_i, k) => k.escape && popScreen());
  useEffect(() => {
    doctor(
      db,
      tuiReporter({ log: () => {} }, {
        confirm: () => Promise.resolve(true),
        prompt: () => Promise.resolve(''),
        selectOne: () => Promise.reject(new Error('n/a')),
        multiSelect: () => Promise.reject(new Error('n/a')),
      }),
    ).then(setR);
  }, []);
  return (
    <Box flexDirection="column">
      <Text>doctor</Text>
      {r && (
        <Box flexDirection="column">
          <Text>db exists:        {String(r.dbExists)}</Text>
          <Text>db integrity ok:  {String(r.dbIntegrityOk)}</Text>
          <Text>db perm ok:       {String(r.dbPermOk)}</Text>
          <Text>dir perm ok:      {String(r.dirPermOk)}</Text>
          <Text>orphan blobs:     {r.orphanBlobs}</Text>
          <Text>broken links:     {r.brokenLinks}</Text>
        </Box>
      )}
      <Text dimColor>esc back</Text>
    </Box>
  );
}
```

- [ ] **Step 9：lint + typecheck + test 全绿**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 全绿。

- [ ] **Step 10：commit**

```bash
git add src/tui/screens
git commit -m "feat(tui): 实装剩余 12 个 Screen（status/ls/add/rm/diff/projects/link/rename/remove/rules/trash/doctor）"
```

---

## 阶段 6：发布与文档

### Task 6.1：完整 E2E 集成测试

**Files:**
- Create: `test/integration/e2e.test.ts`

- [ ] **Step 1：实现**

```ts
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { add } from '../../src/commands/add.js';
import { init } from '../../src/commands/init.js';
import { ls } from '../../src/commands/ls.js';
import { restore } from '../../src/commands/restore.js';
import { rm } from '../../src/commands/rm.js';
import { save } from '../../src/commands/save.js';
import { status } from '../../src/commands/status.js';
import { openDb } from '../../src/db/index.js';
import { silentReporter } from '../helpers/reporter.js';

describe('e2e: full lifecycle', () => {
  let proj: string;
  let dbPath: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'e2e-proj-'));
    dbPath = join(mkdtempSync(join(tmpdir(), 'e2e-db-')), 't.db');
    writeFileSync(join(proj, '.env'), 'A=1');
    writeFileSync(join(proj, 'AGENTS.md'), '# a');
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it('init → modify → save → delete → restore round-trip', async () => {
    const db = openDb(dbPath);
    await init(db, { cwd: proj, alias: 'p', noScan: false, yes: true }, silentReporter());
    expect((await ls(db, { cwd: proj, all: false }, silentReporter())).length).toBeGreaterThan(0);

    writeFileSync(join(proj, '.env'), 'A=2');
    let s = await status(db, { cwd: proj }, silentReporter());
    expect(s.entries.find((e) => e.path === '.env')?.state).toBe('changed');

    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, silentReporter());
    s = await status(db, { cwd: proj }, silentReporter());
    expect(s.entries.find((e) => e.path === '.env')?.state).toBe('unchanged');

    unlinkSync(join(proj, '.env'));
    const r = await restore(
      db,
      { cwd: proj, projectAlias: 'p', yes: true, noBackup: true, dryRun: false },
      silentReporter(),
    );
    expect(r.created).toContain('.env');
    expect(readFileSync(join(proj, '.env'), 'utf8')).toBe('A=2');

    await add(db, { cwd: proj, paths: ['AGENTS.md'], exclude: false }, silentReporter());
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, silentReporter());
    await rm(db, { cwd: proj, paths: ['AGENTS.md'] }, silentReporter());
    await save(db, { cwd: proj, allowLarge: false, dryRun: false }, silentReporter());
    const list = await ls(db, { cwd: proj, all: false }, silentReporter());
    expect(list.find((l) => l.path === 'AGENTS.md')).toBeUndefined();
    db.close();
  });
});
```

- [ ] **Step 2：跑 E2E + 全部测试 + commit**

Run: `pnpm test`
Expected: 全绿。

```bash
git add test/integration/e2e.test.ts
git commit -m "test: 添加 e2e 全生命周期集成用例"
```

---

### Task 6.2：构建打包验证

**Files:**
- Modify: `package.json`（如有调整）

- [ ] **Step 1：build**

Run: `pnpm build`
Expected: `dist/cli.js` 生成，含 shebang `#!/usr/bin/env node`。

- [ ] **Step 2：smoke test 安装产物**

Run:
```bash
node dist/cli.js --help
node dist/cli.js version
```
Expected: 命令列表正常输出 / 版本号。

- [ ] **Step 3：本地 link 验证 npx 体验**

Run:
```bash
pnpm link --global
contextor --help
```
Expected: 全局 `contextor` 命令可用。

- [ ] **Step 4：commit（如有 package.json 调整）**

```bash
git add package.json
git commit -m "chore(build): 验证打包产物"
```

---

### Task 6.3：README + LICENSE

**Files:**
- Create: `README.md`
- Create: `LICENSE`

- [ ] **Step 1：`README.md`**

```markdown
# contextor

> 项目级开发上下文（`.claude/`、`.cursor/`、`.codebuddy/`、`.codex/`、`.gemini/`、`.vscode/`、`.env*`、`AGENTS.md`、`CLAUDE.md` 等）的本地 SQLite 同步与还原工具。

## 痛点

每个项目都有大量个人配置文件不入 git：AI 助手规则、IDE 配置、`.env`。换机器或重新 clone 后还原非常麻烦。`contextor` 把这些文件按项目维度存进本地 SQLite，让 `restore` 一键还原。

## Quick Start

```bash
# 任何项目目录
npx contextor init       # 自动按全局规则扫描，TUI 勾选确认，立即落库
# 改动配置后
npx contextor save
# 新机器 / 重新 clone
git clone <repo> && cd <repo>
npx contextor restore    # 自动按 git remote 匹配项目并还原
```

## TUI

`contextor` 不带参数进入 TUI 入口菜单，所有命令都可在菜单中可达。

```
$ contextor
```

## 数据位置

- 数据库：`~/.contextor/contextor.db`（目录 700 / 文件 600）
- 回收站：`~/.contextor/trash/<alias>/<UTC-timestamp>/`

## 安全说明

v1 **不加密**。`.env` 等含密钥的文件以明文 BLOB 存进本地 SQLite。建议：

- 仅在已开启全盘加密（macOS FileVault 等）的设备使用。
- **不要**把 `~/.contextor/contextor.db` 提交到任何远程仓库或网盘。

## 命令速览

| 命令 | 用途 |
|------|------|
| `init` | 初始化当前项目并立即 save |
| `save` | 把受管文件写入 SQLite（覆盖式） |
| `restore` | 还原受管文件（含 trash 备份） |
| `add / rm / ls` | 编辑 manifest |
| `status / diff` | 查看本地与库的差异 |
| `projects / link / rename / remove` | 项目管理 |
| `rules` | 全局扫描规则 |
| `trash` | 回收站管理 |
| `doctor / gc` | 自检与垃圾回收 |

详见 `contextor --help`。

## 设计

完整设计见 `docs/superpowers/specs/2026-05-11-contextor-design.md`。
```

- [ ] **Step 2：`LICENSE`**（MIT）

```
MIT License

Copyright (c) 2026 contextor authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3：commit**

```bash
git add README.md LICENSE
git commit -m "docs: 添加 README 与 LICENSE"
```

---

### Task 6.4：CI（GitHub Actions）

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1：实现**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        node: [20]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 2：commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 添加 GitHub Actions CI（lint/typecheck/test/build）"
```

---

## 阶段 7：完工检查

- [ ] **Step 1：跑全套**

Run: `pnpm ci`
Expected: 全绿。

- [ ] **Step 2：手动 smoke 一次完整流程**

```bash
mkdir -p /tmp/contextor-smoke && cd /tmp/contextor-smoke
git init
echo "A=1" > .env
echo "# hi" > AGENTS.md
node /path/to/contextor/dist/cli.js init --alias smoke --yes
echo "A=2" > .env
node /path/to/contextor/dist/cli.js save
rm .env
node /path/to/contextor/dist/cli.js restore --yes
cat .env  # 应为 A=2
node /path/to/contextor/dist/cli.js doctor
```

- [ ] **Step 3：v0.1.0 tag**

```bash
git tag -a v0.1.0 -m "contextor v0.1.0 — first release"
```

---

## Spec ↔ Plan 覆盖追溯

| Spec 章节 | 覆盖 Task |
|-----------|-----------|
| §0 目的 / 非目的 | 全 plan |
| §1 核心概念 | 通过 schema + commands 体现（Task 1.1 / 3.x） |
| §2 数据模型 | Task 1.1 |
| §2.4 默认规则 | Task 1.1（seed） |
| §3 技术栈 | Task 0.1 / 0.2 |
| §4 仓库结构 | Task 0.1 + 各 Task 路径 |
| §4.1 架构铁律 | Task 3.0 + 各 commands/* |
| §5.1 init/save/restore | Task 3.1 / 3.2 / 3.3 |
| §5.2 add/rm/ls | Task 3.4 |
| §5.3 projects/link/rename/remove | Task 3.5 |
| §5.4 status/diff | Task 3.6 |
| §5.5 rules | Task 3.7 |
| §5.6 trash | Task 3.7 |
| §5.7 doctor/gc/version | Task 3.7 + Task 0.3 |
| §6.1 init 流程 | Task 3.1 |
| §6.2 save 流程（含空变更判定） | Task 3.2 |
| §6.3 restore 流程（D 冲突 + trash） | Task 3.3 |
| §6.4 入口菜单 | Task 5.3 |
| §6.5 TUI 组件树 | Task 5.1 + 5.3 + 5.4 + 5.5 |
| §7.1 路径/symlink/binary/git skip | Task 2.3 + 2.4（核心 walk 逻辑） |
| §7.2 权限 600/700 | Task 1.1（`openDb`） |
| §7.3 monorepo（v1 整仓） | Task 2.1（findGitRoot） |
| §8 测试策略 | 各 Task 测试 + Task 6.1 e2e |
| §9 v1 In/Out | 全 plan |
| §10 演进 v2+ | 不实现，schema 留扩展位（Task 1.1） |

---

*执行时建议按 superpowers:subagent-driven-development，每 Task 一个 subagent，主代理在 Task 间做 review 与 commit gate。*

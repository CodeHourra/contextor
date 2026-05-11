# contextor — 项目级开发上下文同步工具（v1 设计）

> 状态：**设计已确认（2026-05-11），待生成实现计划**
> 范围：v1 一锤定音；v2+ 仅占位，不在本文件实现

---

## 0. 目的与非目的

### 0.1 目的

为「每个代码项目都有的、不入 git 的个人开发上下文文件」提供一种**项目维度**的同步与还原机制。

典型上下文文件：

- AI 助手规则与配置：`.claude/`、`.cursor/`、`.codebuddy/`、`.codex/`、`.gemini/`
- IDE/编辑器配置：`.vscode/`
- 项目级文档约定：`AGENTS.md`、`CLAUDE.md`
- 环境变量与本地密钥：`.env*`

核心使命：**让"换机器 / 重新 clone 项目"后的恢复成本接近 0。**

### 0.2 非目的（v1 明确不做）

- 跨设备自动同步（用户自行决定 `~/.contextor/` 怎么备份/同步）
- 加密（v1 明文，schema 留扩展位）
- 文件 watcher 自动 save
- 版本快照与回滚（v1 仅"覆盖式存最新一份"）
- 团队共享配置 / 项目内 manifest 文件
- 恢复 symlink 类型
- monorepo 子目录粒度的独立 project

---

## 1. 核心概念

| 概念 | 含义 |
|---|---|
| **Project（项目）** | 一个被 contextor 管理的代码项目。主键优先用 git origin remote URL（标准化后），无 git 时用用户指定的 alias。 |
| **Manifest（清单）** | 某个项目下被纳入管理的文件/目录列表 + 排除规则。存在 SQLite，不在项目目录里塞文件。 |
| **Managed File（受管文件）** | manifest 解析后展开的具体文件路径（例如 `.claude/` 展开成里面所有文件）。 |
| **File Blob** | 文件的二进制内容，按 sha256 hash 去重存储。 |
| **Global Rules（全局规则）** | 跨所有项目通用的扫描模式（默认 + 用户追加），用于 `init` 时智能识别"哪些是个人配置"。 |
| **Trash（回收站）** | restore 覆盖前对本地版本的自动备份，存放在 `~/.contextor/trash/`。 |

---

## 2. 数据模型

### 2.1 数据库位置与权限

- 数据库文件：`~/.contextor/contextor.db`
- 目录权限：`700`
- 文件权限：`600`
- `doctor` 命令负责检测并提示修复异常权限

### 2.2 SQLite Schema

```sql
-- 项目记录
CREATE TABLE projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alias           TEXT NOT NULL UNIQUE,         -- 显示用别名（git 项目可自动从 remote 推导，无 git 必填）
  remote_url      TEXT UNIQUE,                  -- 标准化后的 git origin URL，可空
  root_path_hint  TEXT,                         -- 最近一次 init/save/restore 的本地绝对路径（仅作提示）
  created_at      INTEGER NOT NULL,             -- unix epoch (ms)
  updated_at      INTEGER NOT NULL
);

-- 内容寻址的 blob 存储（去重 + 前向兼容加密）
CREATE TABLE file_blobs (
  hash               TEXT PRIMARY KEY,          -- sha256(content) 十六进制
  content            BLOB NOT NULL,
  size               INTEGER NOT NULL,
  encryption_method  TEXT NOT NULL DEFAULT 'none',
  created_at         INTEGER NOT NULL
);

-- 受管文件 (v1 覆盖式: 每个 (project, path) 只存最新一份)
CREATE TABLE managed_files (
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,                   -- 项目根目录的相对路径 (POSIX 风格)
  blob_hash    TEXT NOT NULL REFERENCES file_blobs(hash),
  mode         INTEGER NOT NULL,                -- unix mode (e.g. 0644 / 0755)
  is_dir       INTEGER NOT NULL DEFAULT 0,      -- 标记目录条目 (内容为空 blob)
  saved_at     INTEGER NOT NULL,
  PRIMARY KEY (project_id, path)
);

-- Manifest 条目 (描述"哪些路径 / pattern 被纳入管理")
CREATE TABLE manifest_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,                   -- 用户在 add 时给的原始路径或 pattern
  kind         TEXT NOT NULL CHECK (kind IN ('include','exclude')),
  created_at   INTEGER NOT NULL,
  UNIQUE (project_id, path, kind)
);

-- 全局扫描规则
CREATE TABLE global_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern      TEXT NOT NULL UNIQUE,            -- glob pattern
  is_default   INTEGER NOT NULL DEFAULT 0,      -- 区分内置默认 vs 用户添加
  created_at   INTEGER NOT NULL
);

-- KV 元信息 (schema 版本 / 配置项 / 最近使用项目等)
CREATE TABLE meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_managed_files_project ON managed_files(project_id);
CREATE INDEX idx_manifest_project ON manifest_entries(project_id);
```

### 2.3 设计要点

- **内容寻址 + GC**：blob 按 hash 去重；删项目或 manifest 移除路径 → 对应 `managed_files` 行删除 → 找所有不再被引用的 hash → 删 blob。`contextor doctor` / `gc` 可触发清理。
- **覆盖式语义**：`managed_files` 主键 `(project_id, path)`，同一文件 save 多次只是换 `blob_hash`。
- **目录条目**：`is_dir=1` + 零长 blob 占位，restore 时用来重建空目录 + 保留 mode（不然空目录 / 权限位无处记录）。
- **Manifest**：`kind='include' | 'exclude'`。Include 是"add 进来的具体路径或 pattern"，Exclude 用于"我 add 了 `.cursor/` 但想排除 `.cursor/cache/`"。
- **加密预留**：`file_blobs.encryption_method` 默认 `'none'`，未来加 `'age'` / `'sqlcipher'` 等无 schema 破坏。
- **schema 版本**：写入 `meta('schema_version', '1')`；未来迁移走 `db/migrations/`。

### 2.4 默认全局规则（`is_default=1`）

```
.claude/
.cursor/
.codebuddy/
.codex/
.gemini/
.vscode/
.env*
AGENTS.md
CLAUDE.md
```

> 说明：以 `/` 结尾视为目录递归；其它按 picomatch glob 解析。

---

## 3. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| Runtime | **Node 20+** | 兼顾 npx 用户群，避免太新 / 太旧 |
| Language | **TypeScript（strict）** | 类型安全、IDE 体验好 |
| 包管理 | **pnpm** | 快、磁盘友好 |
| CLI 框架 | **commander** | 最成熟、API 稳定、命令树清晰 |
| TUI 框架 | **ink + ink-select-input + ink-text-input + ink-spinner** | React 风格、可组合，承载"全命令 TUI" |
| Prompt（CLI 模式） | **@inquirer/prompts** | 命令行模式下的 confirm/select |
| SQLite | **better-sqlite3** | 同步 API、性能好、prebuilt binary 让 npx 体验丝滑 |
| Glob 匹配 | **picomatch** | 轻量、零依赖 |
| 文件 hash | **node:crypto** | 标准库 |
| Diff | **diff** (kpdecker/jsdiff) | 文本 diff |
| 颜色 | **picocolors** | 极轻量 |
| Git remote 探测 | `node:child_process` 调 `git remote get-url origin` | 零依赖 |
| 测试 | **vitest** | 快、TS 友好 |
| Lint/Format | **biome** | 单工具、快、零配置 |
| Build | **tsup** | 单命令打包 ESM/CJS、CLI 工具友好 |

### 3.1 包与发布

- 包名：`contextor`（被占用则 `@<scope>/contextor`）
- `package.json`：`"bin": { "contextor": "./dist/cli.js" }`、`"engines": { "node": ">=20" }`
- 三种使用方式都支持：`npx contextor` / `npm i -g contextor` / `pnpm dlx contextor`
- 首次 `npx`：依赖 `better-sqlite3` 的 prebuild。若某环境无对应二进制，README 提示"全局安装或源码 build"，不作为 v1 阻塞项。

---

## 4. 仓库结构

```
contextor/
├─ src/
│  ├─ cli.ts                  # commander 入口 + 路由（含 "无参 → TUI"）
│  ├─ tui/                    # ink 组件
│  │  ├─ App.tsx              # 入口菜单
│  │  ├─ commands/            # 每个命令一个 ink 流程
│  │  └─ components/          # 共用组件（Select / Checklist / Confirm / Progress / DiffView）
│  ├─ commands/               # 业务逻辑（CLI 与 TUI 共享，UI 无关）
│  │  ├─ init.ts
│  │  ├─ save.ts
│  │  ├─ restore.ts
│  │  └─ ...
│  ├─ core/                   # 领域核心
│  │  ├─ project.ts           # 项目识别 / 标准化 remote / git root 探测
│  │  ├─ manifest.ts          # manifest 解析 / 展开
│  │  ├─ blob.ts              # 内容寻址 / hash
│  │  ├─ scanner.ts           # 全局规则扫描
│  │  ├─ trash.ts             # 回收站
│  │  └─ conflict.ts          # restore 冲突分类
│  ├─ db/
│  │  ├─ schema.sql
│  │  ├─ migrations/          # 未来 schema 演进
│  │  └─ index.ts             # better-sqlite3 wrapper（含 PRAGMA foreign_keys=ON）
│  └─ utils/
├─ test/
│  ├─ unit/
│  └─ integration/
├─ docs/superpowers/specs/
├─ package.json
├─ tsconfig.json
├─ biome.json
├─ tsup.config.ts
└─ README.md
```

### 4.1 架构铁律

`commands/<verb>.ts` **不能** import 任何 `ink` 或 `commander` 相关的东西。每个命令接收 `options` + `reporter`，返回结构化结果。CLI 层和 TUI 层各自实现自己的 reporter。

```ts
// 示意：commands/restore.ts
type RestoreOptions = {
  projectAlias?: string;
  only?: string;
  backup: boolean;
  yes: boolean;
  dryRun: boolean;
};
type Reporter = {
  confirm(prompt: string): Promise<boolean>;
  selectProject(candidates: Project[]): Promise<Project>;
  progress(stage: string, current: number, total: number): void;
  info(message: string): void;
  warn(message: string): void;
};
type RestoreResult = {
  created: string[];
  overwritten: string[];
  keptLocal: string[];
  trashPath?: string;
};

export async function restore(opts: RestoreOptions, reporter: Reporter): Promise<RestoreResult>;
```

CLI 层用 `@inquirer/prompts` 实现 `confirm/select`；TUI 层用 ink 组件 + Promise 桥接。

---

## 5. CLI 命令清单

每个命令"双形态"：CLI flag 模式可全自动化（脚本/CI），TUI 模式可在入口菜单选或显式 `--tui` 进入。

### 5.1 核心生命周期

```
contextor init [--alias <name>] [--no-scan] [--yes]
```
- 在当前目录初始化项目记录。
- 行为：识别 git origin remote → 无则要求 `--alias` → 写入 `projects` 行 → 按 global rules 扫描 → 弹出 TUI 勾选界面（CLI 模式带 `--yes` 则全选）→ 写入 `manifest_entries` → 立即触发一次 `save`。
- `--no-scan`：跳过自动扫描，建空 manifest，后续手动 `add`。

```
contextor save [-m, --message <msg>] [--allow-large] [--dry-run]
```
- 把当前项目所有受管文件写入 SQLite（覆盖式）。
- 空变更（所有 hash 与上次相同）→ 跳过并提示。
- 单文件 > 10MB 触发大文件保护，需 `--allow-large` 放行。
- `--dry-run`：列出将要 save 的文件清单，不实际写入。
- `-m` 在 v1 写入 `meta` 中作为最近一次操作的备注（无快照表，不持久关联到行）；保留参数为 v2 快照做铺垫。

```
contextor restore [<project-alias>] [--yes] [--no-backup] [--only <glob>] [--dry-run]
```
- 从 SQLite 还原文件到当前目录，走 §6.3 D 冲突流程。
- 不传 alias → 自动按 git remote 匹配；命中 0/多个时报错或交互选择。
- `--only` 限制只还原匹配的文件子集（例如只 restore `.env`）。
- `--dry-run`：只显示摘要不动磁盘。

### 5.2 Manifest 编辑

```
contextor add <path>... [--exclude]
contextor rm <path>...                       # 仅从 manifest 移除，不删本地，下次 save 才从 SQLite 移除
contextor ls [--all]                         # 列当前项目受管文件
```

### 5.3 项目管理

```
contextor projects [--json]                  # 列所有项目: alias / remote / 文件数 / 最后 save
contextor link <alias>                       # 把当前目录绑到已有项目（fork / 多 clone 场景）
contextor rename <old-alias> <new-alias>
contextor remove <alias> [--yes]             # 删除项目所有数据（不可逆，需二次确认）
```

### 5.4 状态/差异

```
contextor status                             # 当前项目: changed / new / missing / untracked-by-rules
contextor diff [<path>]                      # 本地 vs SQLite 文件级 diff（二进制走 hash 比较）
```

### 5.5 全局规则

```
contextor rules                              # 列出所有规则（区分 default/custom）
contextor rules add <pattern>                # 追加用户自定义模式（is_default=0）
contextor rules rm <pattern>                 # 仅允许删 user-added；default 规则不可删
                                              # 若不想要某个 default 规则在某项目生效，请在该项目 manifest 用 add --exclude 抑制
```

### 5.6 Trash

```
contextor trash list [--project <alias>]
contextor trash show <id>                    # 看一份 trash 备份的内容清单
contextor trash restore <id> [--yes]         # 把 trash 备份还原回原位置；
                                              # 若原位置已有同名文件，需 --yes 确认覆盖（不再嵌套备份）
contextor trash clean [--before 30d] [--yes]
```

### 5.7 杂项

```
contextor doctor                             # 自检: db 完整性 / 权限 / 孤儿 blob / 断链
contextor gc                                 # 手动触发 blob GC（doctor 也会建议）
contextor version
contextor --tui                              # 显式进入 TUI 入口菜单（等同于不带参数）
contextor                                    # 不带参数 → TUI 入口菜单
```

---

## 6. 主要工作流

### 6.1 `init` 流程

```
[1] 从 cwd 向上找 .git → 取 origin URL → 标准化
       ↓ 无 git
       ↳ 提示 "未检测到 git, 请输入 alias:" → 读输入

[2] 查 projects 表
       ├─ remote_url 已存在 → 提示 "该 remote 已登记为项目 <alias>"
       │                       TUI / 默认: 提供选项 link / cancel
       │                       link 成功后只更新 root_path_hint，不动 manifest（避免误覆盖另一台机器选择）
       │                       CLI --yes 模式: 自动等价于 link 并打印提示, 跳过 [3]~[6], 走 7
       └─ 不存在 → 创建 projects 行

[3] 按 global_rules 扫描 cwd（深度优先, 跳过 .git/）
       生成候选清单 [(path, size, is_dir)]

[4] 渲染 <FileChecklist>
       默认全部勾选; 用户可反勾 / 加自定义路径

[5] 把勾选结果写入 manifest_entries (kind='include')
       自定义排除写 kind='exclude'

[6] 立即触发 save 把 manifest 对应文件落到 SQLite

[7] 提示 "Done. 用 `contextor restore <alias>` 在新机器上还原。"
```

### 6.2 `save` 流程

```
[1] 识别当前项目（git remote 匹配 → 否则报错让用户 cd 到项目内或 init）

[2] 解析 manifest:
       展开 include 路径（目录递归 + glob）
       减去 exclude 命中 → 得到受管文件集合 F

[3] 大文件检查:
       任意文件 size > 10MB 且未传 --allow-large → 报错列出, 退出

[4] 计算每个文件的 sha256 → 与 managed_files 当前 blob_hash 比较
       三个集合都为空时（无新增 / 无修改 / 无 manifest 删除）→ 报告 "no changes, skip" 退出
       注意: 即便所有现存文件 hash 都一致, 只要存在 "DB 中有但 F 中没有" 的行, 也算变更, 进入 [5]
       否则 → 进入 [5]

[5] 事务开始:
       UPSERT file_blobs（新 hash 才插）
       UPSERT managed_files（覆盖 blob_hash, mode, saved_at）
       DELETE managed_files 中那些不再属于 F 的行（manifest 移除过）
       UPDATE projects.updated_at

[6] 提交事务 + 触发增量 GC（仅清理本次新孤儿 blob）

[7] 显示摘要: 新增 X / 修改 Y / 删除 Z
```

### 6.3 `restore` 流程（D 冲突处理）

```
[1] 项目识别:
       传了 alias → 直接定位
       否则 → git remote 匹配
            ├─ 命中 1 个 → 用这个
            ├─ 命中 0 个 → 报错 "未找到项目, 请用 contextor restore <alias>"
            │              并显示 contextor projects 提示
            └─ 命中多个 → 异常（UNIQUE 约束保证不会发生）

[2] 拉出该项目所有 managed_files → 得到目标状态 T

[3] 扫描当前目录中 T 涉及的路径 → 得到本地状态 L

[4] 冲突分类（三组）:
       A. NEW       : T 有, L 无           → 将新增
       B. CHANGED   : T 有, L 有, hash 不同 → 将覆盖（覆盖前备份本地）
       C. UNTRACKED : L 有但 T 无           → 保留, 不动

[5] 渲染 <ConflictReport>:
       === Will Create ===     (绿色)
         .claude/settings.json
         .env
       === Will Overwrite ===  (黄色, 提示已自动备份到 trash)
         .cursor/rules.md
       === Keep Local ===      (灰色)
         AGENTS.md（未在快照中, 维持现状）

[6] dry-run? → 展示完退出
    --yes? → 跳过确认
    否则: <Confirm> "Proceed? [y/N]"

[7] 用户拒绝 → 退出
    用户同意 → 进入 [8]

[8] no-backup? → 跳过
    否则: 把 B 组所有本地文件复制到
          ~/.contextor/trash/<alias>/<UTC-timestamp>/<原相对路径>
          同目录写一份 manifest.json（project_alias, utc_timestamp, files[]）

[9] 执行写盘:
       A 组 → mkdir -p + write + chmod mode
       B 组 → 覆盖文件
       C 组 → 不动

[10] 显示摘要: created X / overwritten Y (backed up: trash_path) / kept Z
```

### 6.4 入口菜单（TUI 模式）

```
$ contextor       # 不带参数

╭─ contextor ────────────────────────────────╮
│ Current project: foo  (origin: github.com/.../foo)
│
│  > init       初始化当前目录
│    save       保存当前项目配置
│    restore    还原项目配置
│    add        添加文件到管理
│    rm         移除文件
│    ls         查看受管文件
│    status     查看状态
│    diff       查看差异
│    ─────────
│    projects   管理所有项目
│    link       绑定到已有项目
│    rules      管理全局规则
│    trash      回收站
│    doctor     系统自检
│    quit
╰────────────────────────────────────────────╯
```

- 启动时自动识别 cwd 项目并显示在顶部。
- 选中条目 → 进入对应 `<Screen*>` → 完成后回菜单。
- 不在已知项目里时，菜单顶部显示 `Not in a project. Try 'init' or 'cd' to a project.`，且依赖项目上下文的命令（save/status/diff/add/rm/ls）变灰禁用。
- `Esc` 全局返回上一屏；`q` / `Ctrl+C` 退出。

### 6.5 TUI 组件树

```
<App>                                # 根，管理"当前在哪个屏"
  ├─ <MainMenu>                      # 入口菜单（默认屏）
  ├─ <ScreenInit>
  │     ├─ <ProjectIdentify>
  │     ├─ <ScanResult>
  │     ├─ <FileChecklist>
  │     └─ <ConfirmAndSave>
  ├─ <ScreenSave>
  │     ├─ <StatusDisplay>
  │     ├─ <MessageInput>
  │     └─ <ProgressList>
  ├─ <ScreenRestore>
  │     ├─ <ProjectPicker>
  │     ├─ <ConflictReport>
  │     ├─ <Confirm>
  │     └─ <ProgressList>
  ├─ <ScreenStatus>                  # 只读
  ├─ <ScreenDiff>
  │     ├─ <FilePicker>
  │     └─ <DiffViewer>
  ├─ <ScreenAdd>                     # 输入路径或从扫描结果勾选
  ├─ <ScreenRm>                      # 当前受管文件多选 → 移除
  ├─ <ScreenLs>                      # 列表展示，可按状态过滤
  ├─ <ScreenProjects>                # 列表 + 选中后 detail（含 link/rename/remove 入口）
  ├─ <ScreenLink>                    # 选已有项目 alias 绑定 cwd
  ├─ <ScreenRename>                  # 选项目 + 输入新 alias
  ├─ <ScreenRemove>                  # 选项目 + 二次确认
  ├─ <ScreenRules>
  ├─ <ScreenTrash>
  └─ <ScreenDoctor>
```

状态管理：全局 React Context 仅持 `currentScreen` / `db connection` / `activeProject` / `themeColors`；其余局部 `useState`。不引入 redux/zustand。

---

## 7. 边界细节

### 7.1 路径与文件类型

| 场景 | 行为 |
|------|------|
| **路径规范化** | manifest 与 DB 一律存 POSIX 相对路径（`path.posix`），禁止 `..` 逃出项目根；`add` 时先解析为绝对路径再相对化。 |
| **符号链接** | v1 跟随 symlink 读真实文件，写入 blob 的是目标内容；restore 时**写普通文件**（不恢复 symlink 类型）。文档写明限制。 |
| **目录** | `is_dir=1` + 空 blob 占位；restore 时 `mkdir` + `chmod`。 |
| **二进制 / 大文件** | 与文本同等存 BLOB；`diff` 对二进制仅显示「hash 不同 / 大小」；默认 10MB 软上限，需 `--allow-large` 放行。 |
| **`.git/`** | 扫描与受管路径展开时一律跳过。 |
| **项目根定位** | 与 `git` 行为一致：从 cwd 向上找 `.git/` 目录；找到即为项目根。无 git 项目则以 cwd 为根。 |

### 7.2 权限与安全（v1 明文）

- `~/.contextor/` 目录权限 `700`；`contextor.db` 文件权限 `600`。
- 不把 db 路径或任何项目数据写到项目目录内。
- Trash 内 `manifest.json`：`{ project_alias, utc_timestamp, files: [{ path, original_hash }] }`，便于审计与手动恢复。
- README 明确告知：v1 不加密，建议开启整机磁盘加密（macOS FileVault 等）。

### 7.3 Monorepo / 多 clone

- v1 仍是「整仓一个 project」。同一 `origin` 在本机多个目录被识别为同一 project。
- `restore` 始终写到当前 cwd 所属项目根（向上找 git root）。
- 子项目粒度（`subpath`）留给 v2。

### 7.4 命令保留范围

v1 保留 `link / rename / remove` 三件项目管理命令。`rename` 仅改 `alias`；`remove` 需 `--yes`。

---

## 8. 测试策略（v1 最低线）

| 类别 | 范围 |
|------|------|
| **单元（vitest）** | `core/project`（remote 标准化）、`core/manifest`（include/exclude 展开）、`core/scanner`、`core/conflict`（A/B/C 分类）、`core/trash`（路径/manifest 生成）、`core/blob`（hash + GC） |
| **集成** | 在临时目录 + 临时 DB 跑 `init → 改文件 → save → 修改 → restore → assert`；覆盖大文件保护、dry-run、--yes、--no-backup |
| **TUI** | 关键路径 smoke：入口菜单导航、init Checklist、restore Confirm。可选 `ink-testing-library`，不要求全覆盖 |
| **Lint/Type** | biome + tsc --noEmit 为 CI 必过项 |

---

## 9. v1 范围

### 9.1 In

- 本地 SQLite，存 `~/.contextor/contextor.db`
- 覆盖式 save（无快照）
- restore + trash + dry-run（D 流程）
- 全局默认规则（含 `.vscode/`）
- 双形态 manifest：init 扫描 + TUI 勾选 + `add`/`rm`
- 全部 CLI 命令；全部命令可从 TUI 入口菜单进入
- 大文件保护（10MB 软上限）
- `doctor` / `gc` / `link` / `rename` / `remove`
- 项目根用 git root 探测（向上找 `.git`）

### 9.2 Out（明确不做）

- 加密
- 快照 / 历史 / 回滚
- watch 自动 save
- 云同步 / 团队共享 manifest 文件
- symlink 类型恢复
- monorepo 子项目

---

## 10. 演进路径（v2+ 占位）

| 方向 | 切入点 |
|------|--------|
| **快照与历史** | 在现有 blob 表上加 `snapshots` / `snapshot_files`；`save -m` 真正落库；`restore --at` 上线 |
| **加密** | 启用 `file_blobs.encryption_method`；新增密钥管理命令（生成/导入/导出/Keychain 集成） |
| **monorepo 子项目** | `projects` 增加 `subpath`，主键改为 `(remote_url, subpath)` |
| **可选项目内 manifest** | 引入 `.contextor.toml`（仅声明 include/exclude，不入密钥），便于团队共享"建议同步列表" |
| **watch 自动 save** | 新增 `contextor watch`，debounce + 跨平台 fsnotify |

---

## 11. 已锁定的关键决策汇总（追溯方便）

| # | 决策 | 选择 |
|---|------|------|
| 1 | 存储后端 | 本地 SQLite，不上云，不绑 git 仓库 |
| 2 | 内容来源 | 全局规则扫描 + TUI 勾选（默认 D） |
| 3 | 项目识别 | git origin URL 标准化为主键 + 无 git 时 alias 兜底（D 多策略） |
| 4 | 版本策略 | v1 覆盖式（A）；schema 留扩展位 |
| 5 | restore 冲突 | dry-run + 交互确认 + 自动 trash 备份（D） |
| 6 | 加密 | v1 不加密（A）；schema 留 `encryption_method` 列 |
| 7 | 命令形态 | 全命令双形态：CLI flag + TUI 菜单可达 |
| 8 | 入口菜单 | `contextor` 无参 → TUI 入口；菜单含全部命令 |
| 9 | 大文件 | 默认 10MB 软上限，需 `--allow-large` |
| 10 | 自动 save | v1 不做 watch |
| 11 | 默认规则 | `.claude/ .cursor/ .codebuddy/ .codex/ .gemini/ .vscode/ .env* AGENTS.md CLAUDE.md` |
| 12 | 技术栈 | Node 20+ / TS / commander / ink / better-sqlite3 / vitest / biome / tsup |
| 13 | 数据库路径 | `~/.contextor/contextor.db`（目录 700, 文件 600） |
| 14 | symlink | 跟随读取，restore 写普通文件 |
| 15 | 项目根 | 向上找 git root；无 git 用 cwd |

---

*本文件即 v1 实现的权威设计。后续实现计划由 `writing-plans` skill 基于本文件生成。*

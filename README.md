# contextor

[![CI](https://github.com/CodeHourra/contextor/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeHourra/contextor/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@codehourra/contextor.svg)](https://www.npmjs.com/package/@codehourra/contextor)
[![license](https://img.shields.io/npm/l/@codehourra/contextor.svg)](./LICENSE)

项目级开发上下文（`.claude/`、`.cursor/`、`.codebuddy/`、`.codex/`、`.gemini/`、`.vscode/`、`.env*`、`AGENTS.md`、`CLAUDE.md` 等）的本地 SQLite 同步与还原 CLI。

> npm 包名：`@codehourra/contextor`（registry 里一律小写；`contextor` 无 scope 名已被无关包占用，`contextor-cli` 为他人 tombstone 包）。安装后可执行命令仍是 `contextor`。

## 为什么需要它

大量个人化配置刻意不进 git：AI 助手规则、IDE 配置、本地 `.env`。换机器或重新 clone 后手工还原成本高。`contextor` 按项目维度把这些文件快照进本地 SQLite，需要时用 `restore` 一键写回工作区。

## 安装

```bash
# 一次性运行（注意带 -y，避免 npx 在非 TTY 终端下回退到 PATH 找 contextor）
npx -y @codehourra/contextor --help
pnpm dlx @codehourra/contextor --help

# 全局安装（之后可直接运行 contextor）
npm install -g @codehourra/contextor
# 或
pnpm add -g @codehourra/contextor

contextor --version
```

> bin 名固定为 `contextor`。首次安装会编译 `better-sqlite3` 的 native binding，可能需要 30~60 秒，是正常现象。

## Quick Start

```bash
cd /path/to/your/git/repo
contextor init --yes --alias myapp    # 登记项目并按 manifest 规则首次 save（TUI 下可多选）
# 修改配置后
contextor save
# 新机器 / 新 clone
cd /path/to/repo
contextor restore --yes               # 按 cwd / git remote 解析项目并还原受管文件
```

首次在无 TUI 场景下建议显式 `--alias`；带 TUI 时可交互输入别名与勾选扫描结果。

## 命令一览

| 命令 | 说明 |
|------|------|
| `init` | 登记当前仓库为项目并写入首次快照 |
| `save` | 将受管文件写入数据库（覆盖式） |
| `restore` | 从数据库还原到磁盘（可选 restore 前 trash 备份） |
| `add` / `rm` / `ls` | 维护 manifest 包含/排除与列表 |
| `status` / `diff` | 工作区与库内快照的差异 |
| `projects` / `link` / `rename` / `remove` | 多项目管理 |
| `rules` | 全局扫描规则 |
| `trash` | `~/.contextor/trash` 下按次还原备份的 list / show / restore / clean |
| `doctor` / `gc` | 健康检查与孤儿 blob 回收 |
| `version` | 打印版本字符串 |

完整子命令与选项见：

```bash
contextor --help
```

## TUI

在终端为 TUI 且未带子命令时，运行 `contextor` 会进入 Ink 主菜单，各命令均可从菜单进入。

## 数据目录 `~/.contextor`

- 默认数据库：`~/.contextor/contextor.db`（目录权限 700、库文件 600）
- 还原前本地覆盖备份：`~/.contextor/trash/<alias>/<UTC 时间戳>/`

可用全局选项 `--db <path>` 覆盖数据库路径（便于测试或多库）。

## 安全说明

v1 **不加密**。`.env` 等敏感内容以明文 blob 存于本地 SQLite。建议仅在已全盘加密的设备使用，且不要将 `contextor.db` 提交到远程或同步到不可信网盘。

## 限制（v1）

- 主要面向 **macOS / Linux**；Windows 未作一等支持。
- 若受管路径为符号链接，行为按**普通文件**读写处理，不会保留 symlink 语义。
- 大文件默认跳过，需 `save --allow-large`。

## 设计与规格

详细设计见 `docs/superpowers/specs/2026-05-11-contextor-design.md`。

## License

MIT — 见仓库根目录 `LICENSE`。

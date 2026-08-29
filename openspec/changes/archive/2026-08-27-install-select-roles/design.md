## Context

`install.sh` 是 Kaneo agent 配置的安装脚本，随下载包分发，用户手动执行。当前支持 `--target`（目标目录）和 `--agent`（目标工具：opencode / claude code / codex）。此前实现把 7 个 `requiredRole` 作为 subagent 注册到各工具的 agents 目录（`.opencode/agents/<role>/`、`.claude/agents/<role>.md`、`.codex/agents/<role>.md`）。

用户澄清：opencode / claude code / codex 是 **agent 工具**，而"角色"是通过 AGENT.md / SOUL.md / CLAUDE.md 设定的**工作人格**（模式/性格/能力）。一个工具实例应对应一个人格。

## Goals / Non-Goals

**Goals:**
- `--role <name>` 选择一个 Kaneo 预定义角色（人格），写入所选工具的主指令文件
- 三种工具映射：opencode → `AGENT.md`，claude code → `CLAUDE.md`，codex → `AGENTS.md`
- 使用现有 7 个 `requiredRole`，无效角色报错
- skills 随所选角色安装
- 严格一个工具实例对应一个人格

**Non-Goals:**
- 不把多个角色注册为可切换的 subagent（方案 B 被排除）
- 不新增数据库列或 API 变更
- 不改变 `--target` / `--agent` 的行为

## Decisions

### Decision 1: 主指令文件即人格载体

所选角色的 AGENTS.md 内容写入该工具的主指令文件。这是 agent 工具启动时自动加载的顶层指令，决定了 agent 的工作模式、性格和能力。不再生成注册多个 subagent 的配置。

**Rationale**: 符合用户对"一个工具实例 = 一个人格"的理解，主指令文件是 agent 工具人格的最直接载体。

### Decision 2: 三种工具的主指令文件映射

- **opencode** → `AGENT.md`（opencode 读取的顶层指令文件）
- **claude code** → `CLAUDE.md`
- **codex** → `AGENTS.md`

**Rationale**: 每种工具约定不同的顶层指令文件名，按各自约定写入。

### Decision 3: `--role` 单值

`--role <name>` 只接受一个角色（一个人格），不再支持逗号分隔或 `all`。因为严格一个实例一个人格，多值无意义。

**Rationale**: 与方案 A"一个工具实例对应一个人格"一致。

### Decision 4: skills 随角色安装

角色定义中引用的 skills（如 claim-task、repo-sync 等）安装到对应工具的 skills 目录（`.opencode/skills/`、`.claude/skills/`、`.codex/skills/`）。skills 是角色工作所需的能力，随人格一起提供。

**Rationale**: 用户明确要求"skills 随角色安装"。

### Decision 5: 有效角色校验

`--role` 值必须在 7 个 `requiredRole` 中，否则报错并列出可选值。

**Rationale**: 提前失败，避免写入错误的人格。

## Risks / Trade-offs

- **覆盖已有主指令文件**: 写入 `AGENT.md` / `CLAUDE.md` / `AGENTS.md` 会覆盖项目现有文件。→ 备份为 `.bak`。
- **skills 粒度**: 不同角色可能引用不同 skills，全量安装 skills 可能引入不相关的。→ 先全量安装，后续可按角色细化。

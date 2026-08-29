## Why

Kaneo 的 agent 配置安装脚本（`install.sh`）当前用 `--agent` 选择目标工具（opencode / claude code / codex），并安装全部 7 个角色定义到各工具的 subagent 目录（`.opencode/agents/<role>/` 等）。但用户希望的是：**opencode / claude code / codex 是 agent 工具，角色是通过 AGENT.md / SOUL.md / CLAUDE.md 文件设定的工作人格（模式/性格/能力）**。一个工具实例应当对应一个人格，而不是注册多个可切换的 subagent。

## What Changes

- 重新定义 `--role <name>`：选择一个 Kaneo 预定义的角色（人格），将该角色的 AGENTS.md 内容写入所选工具的主指令文件，使该工具实例按此人格工作
- 三种工具的映射：
  - **opencode** → `AGENT.md`（或 SOUL.md）
  - **claude code** → `CLAUDE.md`
  - **codex** → `AGENTS.md`
- `--role` 使用现有 7 个 `requiredRole`（coding, product-design, architecture-design, devops, ui-design, testing, code-review），无效角色报错
- skills 随所选角色安装（将所选角色的 skill 支持内容安装到对应工具的 skills 目录）
- 严格一个工具实例对应一个人格：不再把多个角色注册为 subagent，而是让主指令文件明确设定人格

## Capabilities

### New Capabilities

- `install-role-persona`: 安装脚本支持通过 `--role` 参数为指定 agent 工具实例设定一个人格角色，写入该工具的主指令文件

### Modified Capabilities

- `agent-setup-script`: 安装脚本从"注册多个 subagent 角色"改为"为一个工具实例设定单一人格"

## Impact

- **安装脚本**: `apps/api/src/agent/agents/install.sh.template` 重写 `--role` 逻辑，写入主指令文件
- **配置生成**: `apps/api/src/agent/agents/package.ts` 生成的人格配置从"注册多个角色"改为"按所选角色生成单一人格"
- **测试**: 更新安装脚本相关测试（人格写入、无效角色校验）
- **无数据库变更**，无 API 变更

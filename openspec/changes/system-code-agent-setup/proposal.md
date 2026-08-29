## Why

Kaneo 平台已有任务和 `requiredRole` 角色体系（coding、product-design、architecture-design、devops、ui-design、testing、code-review），但没有通用的 code agent 来自动认领并执行这些任务。pi-agent 目前只是一个项目管理助手（创建/查询任务），不能真正执行代码工作。平台需要一组系统级的 agent 配置（AGENTS.md 角色定义 + 通用 skills + 安装脚本），让外部 code agent（如 OpenCode）能通过 API key 认证后认领匹配角色的任务，在工作目录中拉取仓库代码并按 AGENTS.md 中的角色规范完成任务。

## What Changes

- 为每个 `requiredRole` 创建对应的 AGENTS.md 角色定义文件，描述该角色的职责边界、工作规范、禁止事项和质量标准
- 创建一组通用 skills（SKILL.md），覆盖所有角色共享的工作流能力（仓库同步、代码搜索、测试运行、PR 提交等）
- 提供一个安装脚本（install.sh），用户下载后手动在目标目录执行，将 AGENTS.md、skills、opencode 配置安装到项目 agent 工作目录
- 安装脚本适配三种 agent：**opencode**、**claude code**、**codex**，根据用户选择或自动检测将角色定义和 skills 安装到对应 agent 的目录结构
- 在下载包中生成各 agent 的配置文件（opencode.jsonc / CLAUDE.md / AGENTS.md），注册 subagent 角色并链接 skills 路径
- API 端新增 `GET /api/agent/agents-config/download` 端点，返回打包好的配置 zip（含角色定义、skills、各 agent 配置、install.sh）
- 前端管理页面新增 "Agent 配置" 面板，展示可用的角色定义和 skills，提供"下载配置"按钮

## Capabilities

### New Capabilities

- `agent-role-definitions`: 为每个 `requiredRole` 维护对应的 AGENTS.md 角色定义文件，包含职责描述、工作规范、工具权限和质量标准
- `agent-skills`: 维护一组通用 skills（SKILL.md），覆盖代码搜索、测试运行、PR 提交等跨角色共享工作流
- `agent-setup-script`: 提供安装脚本（install.sh），用户下载后手动执行，将角色定义、skills 和 opencode 配置安装到目标目录
- `agent-config-download`: API 端点返回打包好的配置 zip，前端提供下载按钮

### Modified Capabilities

- `agent-roles`: 角色现在有对应的 AGENTS.md 文件，可通过下载包安装

## Impact

- **新增文件**：`apps/api/src/agent/agents/` 目录存放角色定义和 skills 模板；安装脚本模板
- **API**：新增 agent 配置下载端点
- **Web**：管理页面新增 Agent 配置面板，提供下载按钮
- **依赖**：不引入新的外部依赖，复用现有 agent 工作目录基础设施
- **数据库**：不需要 schema 变更
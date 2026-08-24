## Why

Kaneo 的 AI code agent（通过 API key 鉴权）目前只能以单一身份领取任务：`claim-next` 按「未认领 + to-do + 优先级」排序领取，无法区分任务类型。实际研发流程中，任务天然带有专业分工（产品设计、架构设计、运维、界面设计、测试、代码评审），agent 需要以对应角色身份领取专业任务，而不是所有任务都靠一个通用 agent 包揽。

## What Changes

- 定义 7 种 agent 角色：`coding`（代码开发）、`product-design`（产品设计）、`architecture-design`（架构设计）、`devops`（运维管理）、`ui-design`（界面设计）、`testing`（测试）、`code-review`（代码评审）
- 任务可标记 `requiredRole`（所需角色）；未标记 = 通用任务，任何角色可承接
- agent 的 API key 通过 `metadata.agentRole` 声明自身角色（未声明则视为 `coding`）
- 任务领取（claim / claim-next）按三条规则匹配候选：
  1. **指定给自己**：任务已指派给该 agent（assignee = agent 用户）
  2. **角色匹配**：通用任务（`requiredRole` 为空）或 `requiredRole` 等于 agent 角色
  3. **状态匹配**：任务状态在 agent 可领取的状态集合内（to-do 等）
- 新增 API key 创建时的角色选择、任务创建时的所需角色选择、任务卡片/详情的角色徽标
- MCP 工具（`claim_next_task`、`create_task`、`list_unclaimed_tasks`）同步支持角色

## Capabilities

### New Capabilities
- `agent-roles`: agent 多角色身份与按角色领取任务，包括角色词汇、任务所需角色标记、API key 角色身份、claim-next 三规则匹配、UI 与 MCP 支持

### Modified Capabilities

## Impact

- `packages/permissions`: 新增 `AgentRole` 类型、`AGENT_ROLES` 常量、`isAgentRole` 守卫（仓库共享词汇）
- `apps/api`: `task` 表新增 `required_role` 列与迁移；create-task / get-tasks / claim-next 支持角色；`authenticate-api-request` 注入 `apiKey.metadata`；`taskSchema`/OpenAPI 更新
- `apps/web`: 创建任务弹窗角色下拉、API key 创建对话框角色下拉、任务卡片/详情角色徽标
- `packages/mcp` 与 `apps/api/src/mcp/tools.ts`: `claim_next_task` 描述与参数、`create_task`/`list_unclaimed_tasks` 的 `requiredRole` 参数
- `i18n`: 新增角色枚举与表单/徽标键（16 locale）
- `charts`、`Docker`: 无变更（纯应用层功能）
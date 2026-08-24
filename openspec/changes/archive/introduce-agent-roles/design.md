## Context

Kaneo 已有完整的 agent 任务领取链路：

- `POST /api/task/claim/:id` 原子认领任务：`UPDATE ... SET userId, claimedBy, claimedAt, status='in-progress' WHERE userId IS NULL AND status='to-do'`，并发安全
- `POST /api/task/claim-next` 自动领取最优候选：候选 = 团队成员项目内 `status='to-do' AND userId IS NULL`，按 `dueDate ASC NULLS LAST → priority DESC → createdAt ASC` 排序
- agent 身份 = API key（better-auth `apiKey` 插件，`x-api-key` 头）；`verifyApiKey` 解析出 key 的 `permissions`（JSON）与 `metadata`（JSON），`authenticate-api-request` 在上下文注入 `{ id, userId, enabled, permissions }`（未包含 metadata）
- `apikey` 表已有 `metadata` text 列（存 JSON），但 auth.ts 未开启 `enableMetadata`
- 任务表已有 `userId`(assignee)、`status`、`priority`、`dueDate`；无「所需角色」概念；任务标签（label）是自由文本，不适合作角色枚举
- MCP 工具：`claim_task`、`claim_next_task`、`list_unclaimed_tasks`、`create_task` 等（packages/mcp 与 apps/api/src/mcp/tools.ts 两份实现）

## Goals / Non-Goals

**Goals:**
- 定义可共享、可校验的 7 种 agent 角色词汇（含默认 `coding`）
- 任务可标记所需角色，未标记任务任何角色均可承接
- agent 以 API key 声明角色身份，claim/claim-next 按「指定给自己 + 角色匹配 + 状态匹配」三规则匹配候选
- 保持现有领取行为兼容：未声明角色的 API key 等效 `coding`，通用任务（无 requiredRole）仍可领取
- UI 与 MCP 支持角色选择与可见性

**Non-Goals:**
- 不做角色权限矩阵（agent 角色只影响任务匹配，不改变团队 owner/member 权限模型）
- 不做 agent 之间的人工分配工作流（仅通过 assignee 指定）
- 不做任务编辑角色（任务创建后不改 requiredRole，首版）
- 不引入新的认证机制（复用 API key）

## Decisions

### 1. 角色词汇放在 `packages/permissions`

**选择**: 在已有的共享 `@kaneo/permissions` 包新增 `AgentRole`/`AGENT_ROLES`/`isAgentRole`
**理由**: api / web / mcp 三端都要引用，共享包避免重复字符串。团队角色（owner/member）与 agent 角色是不同的词汇，但放同一包便于统一管理。
**枚举**:
```ts
export type AgentRole =
  | "coding"            // 代码开发
  | "product-design"    // 产品设计
  | "architecture-design" // 架构设计
  | "devops"            // 运维管理
  | "ui-design"         // 界面设计
  | "testing"           // 测试
  | "code-review";      // 代码评审
export const AGENT_ROLES: readonly AgentRole[] = [...];
export function isAgentRole(value: unknown): value is AgentRole;
export const DEFAULT_AGENT_ROLE: AgentRole = "coding";
```

### 2. 任务「所需角色」用 `task.requiredRole` 列而非标签

**选择**: `task` 表加 `required_role`（nullable text，应用层校验为 AgentRole 枚举）
**理由**: 标签是自由文本、可多值、含义杂；角色是单值枚举。加列可索引、可校验、查询简单，符合 Kaneo「最小模型」原则。
**语义**: `NULL` = 通用任务（任何角色可承接）；非 NULL = 仅对应角色 agent 可承接。

### 3. agent 角色身份：API key `metadata.agentRole`

**选择**: 开启 better-auth `enableMetadata: true`，创建 API key 时在 `metadata` 写入 `{ agentRole }`；`authenticate-api-request` 把 `metadata`（含解析后的 `agentRole`）注入 `c.get("apiKey")`
**理由**: `apikey` 表已有 metadata 列且 better-auth 原生支持；角色是 API key 的静态属性，天然随 key 生效。未声明角色 → 默认 `coding`，保持现有 agent 完全兼容。
**注意**: `permissions` 字段语义是「资源-动作」访问控制，不适合承载角色；角色放 metadata。

### 4. claim-next 三规则匹配

**选择**: 候选任务 = 属于 agent 团队项目，且满足以下任一「来源规则」，且满足状态匹配：
- **指定给自己**: `userId = agent.userId`（任务指派给该 agent，可领取开始处理）
- **角色匹配**: `userId IS NULL AND (requiredRole IS NULL OR requiredRole = agent.role)`
- **状态匹配**: `status IN ('to-do')`（首版可领取起始状态；后续可按角色扩展状态集合）

排序沿用现有 `dueDate ASC NULLS LAST → priority DESC → createdAt ASC`；「指定给自己」的候选**优先**于角色匹配候选。
**claim/:id 同样校验**：claim 请求必须满足三规则（assignee=自己 或 角色匹配），否则 409/403。

### 5. 显式 requiredRole 请求参数

**选择**: `claim-next` 与 `get-tasks` 支持可选的 `requiredRole` 查询/请求参数，但服务端以 API key `metadata.agentRole` 为身份信任源——显式参数只能收窄到「通用任务 + 自己角色任务」，不能申请其它角色
**理由**: 防止 agent 客户端声明任意角色越权领取；同时允许按角色浏览任务。

### 6. UI 最小改动

**选择**:
- 创建任务弹窗：新增「所需角色」下拉（默认「通用」，7 种角色选项）
- API key 创建对话框：新增「Agent 角色」下拉（默认 `coding`）
- 任务卡片与任务详情：显示角色徽标（有 requiredRole 的任务才显示；颜色映射按角色）
**理由**: 保证角色可被设置、可被看见、可被领取，三个闭环面都覆盖。

### 7. MCP 同步

**选择**: `claim_next_task` 描述说明三规则；`create_task` 支持可选 `requiredRole`；`list_unclaimed_tasks` 支持可选 `requiredRole` 过滤。两份实现（packages/mcp 发布包、apps/api/src/mcp/tools.ts）同步改动。

## Migration

`0047_add_task_required_role.sql`：
```sql
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "required_role" text;
```
（可空、无默认、无外键；索引可选，首版不加，任务量级下全表过滤可接受。drizzle 生成 + 快照/journal 同步。）
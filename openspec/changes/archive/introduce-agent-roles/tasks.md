# 实现任务（引入 Agent 多角色领取）

## 1. 共享角色词汇（packages/permissions）

- [x] 1.1 `packages/permissions/src/index.ts` 新增 `AgentRole` 类型（7 种：coding / product-design / architecture-design / devops / ui-design / testing / code-review）、`AGENT_ROLES` 常量数组、`DEFAULT_AGENT_ROLE = "coding"`、`isAgentRole` 守卫
- [x] 1.2 `packages/permissions/src/index.test.ts` 补充枚举与守卫单测

## 2. 数据库 schema 与迁移

- [x] 2.1 `apps/api/src/database/schema.ts` 的 `taskTable` 新增 `requiredRole: text("required_role")`（nullable）
- [x] 2.2 生成迁移 `0047_add_task_required_role.sql`（`ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "required_role" text;`）并检查 SQL，同步快照/journal
- [x] 2.3 `taskSchema`（apps/api/src/schemas.ts）加入 `requiredRole` 字段，供 OpenAPI 输出

## 3. API key 角色身份

- [x] 3.1 `apps/api/src/auth.ts` 的 `apiKey()` 插件开启 `enableMetadata: true`
- [x] 3.2 `apps/api/src/utils/authenticate-api-request.ts` 的 `c.set("apiKey", ...)` 注入 `metadata`（含解析出的 `agentRole`）
- [x] 3.3 新增/复用工具解析 agent 角色：metadata 中 `agentRole` 经 `isAgentRole` 校验，非法或缺省回退 `DEFAULT_AGENT_ROLE`；暴露 `getAgentRole(c)` 供 claim 逻辑使用

## 4. 任务创建支持角色

- [x] 4.1 `apps/api/src/task/index.ts` create-task validator 增加 `requiredRole: v.optional(v.picklist(AGENT_ROLES))`
- [x] 4.2 `createTask` 控制器持久化 `requiredRole`
- [x] 4.3 单测：合法/非法/缺省 requiredRole

## 5. claim / claim-next 三规则匹配

- [x] 5.1 `claimTask`（claim-task.ts）：校验调用者 agent 角色，规则 = 指派给我（assignee=自己）或 角色匹配（requiredRole 为空或等于自身角色），状态匹配 `to-do`；不满足返回 409/403
- [x] 5.2 `claimNextTask`（claim-next-task.ts）：候选 = 团队项目内可领取任务，满足（指派给我）或（未认领 且 角色匹配）且状态匹配；「指派给我」优先，组内沿用 dueDate/priority/createdAt 排序
- [x] 5.3 claim-next 请求体支持可选 `requiredRole`（仅收窄候选）
- [x] 5.4 单测：三规则组合、指派优先、显式参数收窄、无候选 404

## 6. 任务列表按角色过滤

- [x] 6.1 `get-tasks` 增加 `requiredRole` 查询参数（含与 `unclaimed` 组合）
- [x] 6.2 OpenAPI 查询参数描述更新

## 7. Web UI

- [x] 7.1 创建任务弹窗（create-task-modal.tsx）新增「所需角色」下拉（默认通用 = 无；7 角色选项），提交时透传 `requiredRole`
- [x] 7.2 create-task fetcher（fetchers/task/create-task.ts）支持 `requiredRole` 传参
- [x] 7.3 API key 创建对话框（create-api-key-dialog.tsx）新增「Agent 角色」下拉（默认 coding），创建时传 `metadata: { agentRole }`
- [x] 7.4 任务卡片/详情显示角色徽标（有 requiredRole 才显示；角色→颜色的映射常量）

## 8. MCP 支持

- [x] 8.1 packages/mcp `claim_next_task`：描述补充三规则说明
- [x] 8.2 packages/mcp `create_task`：增加可选 `requiredRole` 参数并透传
- [x] 8.3 packages/mcp `list_unclaimed_tasks`：增加可选 `requiredRole` 查询参数
- [x] 8.4 apps/api/src/mcp/tools.ts 同 8.1–8.3 同步修改
- [x] 8.5 MCP 单测覆盖新参数

## 9. i18n

- [x] 9.1 i18n/en-US.json 新增 `tasks.agentRoles.*`（7 角色名 + 通用），`settings:apiKey.*` 角色字段文案
- [x] 9.2 同步 16 个 locale（键完整，翻译缺失用 en 值兜底或按现存惯例）

## 10. 集成测试

- [x] 10.1 集成测试：带 `agentRole` 的 API key 创建 → claim-next 领取角色匹配任务；非匹配角色拒绝
- [x] 10.2 测试：指派给自己的任务优先被领；通用任务（无 requiredRole）任何角色可领
- [x] 10.3 验证迁移在全新库可建、幂等

## 11. 验证收尾

- [x] 11.1 API 单元/集成、Web 测试、双 typecheck、Biome、构建全绿
- [x] 11.2 OpenAPI 文档包含 `requiredRole`（task schema、create-task、claim-next、get-tasks）
- [x] 11.3 synspec 同步到 main specs 并归档（用户确认后）
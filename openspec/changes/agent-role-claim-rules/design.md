## Context

任务执行 agent 通过 API key 认证，`apiKey.agentRole` 携带 agent 的设定角色。认领任务（`claim-task` / `claim-next-task`）和状态变更（`update-task-status`）目前逻辑简单：所有角色认领 to-do 任务，状态变更不自动设置 requiredRole。code-review 角色目前与其它角色一样只认领 to-do 任务，但 code-review 的职责是审查 in-review 的任务，需要特殊规则。

## Goals / Non-Goals

**Goals:**
- 非 code-review 角色：只认领 to-do 任务，且 requiredRole 匹配（NULL 或等于 agent 角色）
- code-review 角色：只认领 in-review 任务，忽略 requiredRole
- 状态变更时自动设置 requiredRole：
  - → in-progress: requiredRole = agent 设定角色
  - → in-review: requiredRole = code-review
  - → done: requiredRole = NULL
- 创建任务（agent 创建）时 requiredRole = agent 设定角色

**Non-Goals:**
- 不修改安装脚本本身（角色指定和帮助信息已实现）
- 不改变认领后状态的其它行为
- 不引入新的角色

## Decisions

### Decision 1: claimableStatuses 按 agentRole 区分

`claim-next-task.ts` 中，`claimableStatuses` 目前固定为 `["to-do"]`。改为：
- 非 code-review：`["to-do"]`
- code-review：`["in-review"]`

同时 code-review 的候选查询不施加 requiredRole 匹配约束（忽略 requiredRole）。

**Rationale**: 让不同角色认领不同状态的任务，code-review 审查 in-review 任务。

### Decision 2: claim-task 也应用角色状态规则

`claim-task.ts`（单任务认领）当前校验 `candidate?.status !== "to-do"`。改为：
- 非 code-review：要求状态为 to-do，且 requiredRole 匹配
- code-review：要求状态为 in-review，忽略 requiredRole

**Rationale**: 单任务认领和 claim-next 行为一致，避免绕过规则。

### Decision 3: 状态变更时自动设置 requiredRole

`update-task-status.ts` 接收 `agentRole`（可选）。根据目标状态：
- `in-progress`: requiredRole = agentRole
- `in-review`: requiredRole = "code-review"
- `done`: requiredRole = null
- 其它状态：不改变 requiredRole（保持现有值）

**Rationale**: 状态流转到审查/完成阶段时，需要明确下一阶段的负责角色。

### Decision 4: 创建任务时设置 requiredRole

`create-task.ts` 接收 `agentRole`（可选）。若 agent 创建任务且未显式指定 requiredRole，则设为 agentRole。

**Rationale**: agent 创建的任务默认由同角色 agent 处理。

### Decision 5: agentRole 从路由透传

`/api/task/status/:id` 和 `/api/task/:projectId` 路由从 `c.get("apiKey")?.agentRole` 获取 agentRole 并传给控制器。API key 认证时 agentRole 已解析（`authenticate-api-request.ts`）。

**Rationale**: 复用现有认证流程中已解析的 agentRole。

## Risks / Trade-offs

- **code-review 认领 in-review 需要 in-review 是有效状态**: 项目列需包含 in-review 列，否则状态校验失败。→ 由项目配置保证。
- **非 agent 用户（无 agentRole）状态变更**: requiredRole 不会自动设置（agentRole 为空）。→ 仅 agent 触发自动流转，人工操作维持现状。
- **done 清空 requiredRole**: 已完成后不再需要角色标记。→ 符合"完成即结束"语义。

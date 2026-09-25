## Why

任务执行 agent 需要一套明确的角色认领和 requiredRole 流转规则，使不同角色的 agent 各司其职、状态流转时自动设置正确的 requiredRole，避免认领错任务或遗漏 requiredRole。当前认领逻辑对所有角色一视同仁（只认领 to-do 任务），状态变更和创建任务时也不会根据 agent 角色自动设置 requiredRole。

## What Changes

- 明确安装基础设定要求：安装脚本必须指定角色（已有），帮助信息列举角色名称（已有）
- 调整认领逻辑：
  - ToDo 状态且已设定 requiredRole 的任务，若角色与 agent 设定不一致，agent 不得领取
  - **code-review 角色特殊规则**：只领取处于 `in-review` 状态的任务，忽略任务的 requiredRole
- 状态变更时自动设置 requiredRole：
  - 变更为 `in-progress` → requiredRole 设为 agent 的设定角色
  - 变更为 `in-review` → requiredRole 设为 `code-review`
  - 变更为 `done` → requiredRole 设为 `NULL`
- 创建任务时：若由 agent 创建，requiredRole 设为 agent 的设定角色

## Capabilities

### New Capabilities

- `agent-role-claim-rules`: 定义不同角色 agent 的认领规则，包括 code-review 特殊认领逻辑和 requiredRole 自动流转

### Modified Capabilities

- `agent-roles`: 认领规则从"所有角色认领 to-do 任务"扩展为"按角色差异化认领"，状态变更/创建时自动设置 requiredRole

## Impact

- **认领逻辑**: `apps/api/src/task/controllers/claim-task.ts`、`claim-next-task.ts` 增加 code-review 特殊规则
- **状态变更**: `apps/api/src/task/controllers/update-task-status.ts` 根据目标状态和 agent 角色自动设置 requiredRole
- **创建任务**: `apps/api/src/task/controllers/create-task.ts` 由 agent 创建时设置 requiredRole
- **API 路由**: `apps/api/src/task/index.ts` 状态更新/创建端点需传递 agentRole
- **测试**: 新增认领规则、requiredRole 流转相关测试

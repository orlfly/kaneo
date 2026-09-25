## Why

pi-agent 目前只能创建任务、查询任务和巡检异常，无法更新任务状态。系统提示词明确声明"You cannot delete tasks or modify existing tasks directly"。当用户要求 pi-agent 完成任务或关闭任务时，它只能建议手动操作。需要为 pi-agent 添加任务状态更新能力，特别是将任务状态设置为完成（done），使 pi-agent 能参与任务生命周期管理。

## What Changes

- 为 pi-agent 新增 `update_task_status` 工具，允许将指定任务的状态更新为有效的项目状态值（如 `done`、`in-progress`、`archived` 等）
- 更新系统提示词，移除"无法修改任务"的声明，改为说明 pi-agent 可以通过 `update_task_status` 工具更新任务状态
- 工具调用基于调用者的团队权限执行（复用现有 `workspaceAccess` / `requireWorkspacePermission` 模式），确保 pi-agent 只能更新其有权限的任务
- 通过 `update-task-status` 控制器复用现有任务状态更新逻辑（状态校验、事件发布、缓存失效）

## Capabilities

### New Capabilities

- `pi-agent-task-status-update`: 为 pi-agent 提供任务状态更新能力，支持将任务状态设置为完成（done）或其他有效状态

### Modified Capabilities

- `project-chat`: pi-agent 的工具集从只读/创建扩展为包含任务状态更新，系统提示词相应更新

## Impact

- **API**: `apps/api/src/chat/tools.ts` 新增 `update_task_status` 工具定义和 `executeTool` 分支；复用 `updateTaskStatus` 控制器
- **System prompt**: `apps/api/src/chat/controllers/send-message.ts` 更新系统提示词
- **测试**: 新增或更新 pi-agent 工具相关测试
- **无数据库变更**，无 schema 变更

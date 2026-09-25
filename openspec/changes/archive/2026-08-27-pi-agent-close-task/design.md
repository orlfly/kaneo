## Context

pi-agent 是一个项目级 AI 助手，通过 chat 工具与 Kaneo 交互。当前工具集包括 `list_tasks`、`get_task`、`create_task`、`get_project_summary`、`list_blocked_tasks`、`list_merge_requests` 以及一系列 agent 文件/命令工具。系统提示词明确声明 pi-agent "cannot delete tasks or modify existing tasks directly"。

任务有可配置的状态（用户可定义列，如 to-do / in-progress / done / archived 等，另有 planned、paused 虚拟状态）。现有 `update-task-status` 控制器负责校验状态、更新 `status` 和 `columnId`、发布 `task.status_changed` 事件。

## Goals / Non-Goals

**Goals:**
- 为 pi-agent 新增 `update_task_status` 工具，可将指定任务的状态设置为有效的项目状态值
- 通过该工具支持"完成任务"（设置状态为 `done`）和"关闭任务"（归档，设置状态为 `archived`）
- 更新系统提示词，移除"无法修改任务"的声明，说明 pi-agent 可更新任务状态
- 工具调用基于调用者（团队成员）权限执行，遵循现有 `teamAccess` 授权边界

**Non-Goals:**
- 不实现任务删除能力（pi-agent 仍不能删除任务）
- 不修改现有 `update-task-status` 控制器的行为
- 不添加任务状态的自定义字段或新数据库列
- 不改变 pi-agent 的其他只读工具

## Decisions

### Decision 1: 复用现有 updateTaskStatus 控制器

`update_task_status` 工具直接调用现有的 `updateTaskStatus` 控制器（`apps/api/src/task/controllers/update-task-status.ts`），传入 `{ id, status, currentUserId }`。这复用了状态校验、column 解析、事件发布逻辑，避免重复实现。

**Rationale**: 单一事实来源，确保 pi-agent 更新状态的行为与 UI 更新行为完全一致。

### Decision 2: 工具需要 currentUserId

`updateTaskStatus` 控制器需要 `currentUserId` 用于发布事件。当前 `executeTool(toolName, args, projectId)` 签名不含用户信息。需要在 chat 发送流程中把 `userId` 传递给工具执行层。

**方案**: 修改 `executeTool` 和 `executeToolCalls` 签名，增加 `userId` 参数，从 chat 路由上下文中获取（`c.get("userId")`）。

**Rationale**: chat 路由已通过 `teamAccess` + `requireTeamRole("member")` 认证，`userId` 可用且可信。

### Decision 3: 工具参数与状态校验

`update_task_status` 工具接收 `taskId` 和 `status` 两个参数。`status` 必须是项目有效状态值。工具执行时调用 `assertValidTaskStatus`（由控制器内部完成），无效状态会返回错误给模型。

**Rationale**: 保持与 UI 一致的状态校验，防止 pi-agent 设置任意字符串。

### Decision 4: 系统提示词更新

将 `buildSystemPrompt` 中"You cannot delete tasks or modify existing tasks directly. If asked, explain that only task creation, querying, and anomaly inspection are supported."替换为说明 pi-agent 可以更新任务状态，并说明不能删除任务。

**Rationale**: 让模型知道它现在可以执行任务状态更新，从而在用户要求"完成任务/关闭任务"时正确调用工具。

## Risks / Trade-offs

- **权限边界**: pi-agent 更新任务状态的能力取决于调用者（团队成员）的权限。工具执行不额外增加权限，遵循现有 `requireTeamRole("member")`。→ 这是期望行为：pi-agent 以调用者身份操作，不越权。
- **状态有效性**: 如果模型传入无效状态，控制器返回 400，工具结果会传递给模型。→ 模型可据此修正或向用户说明。
- **非预期状态变更**: 模型可能将任务设为非完成状态。→ 系统提示词引导 pi-agent 仅在用户要求时更新状态，并优先使用完成（done）或归档（archived）。

## Migration Plan

无数据库变更，无需迁移。新增工具定义和签名调整，热重载后生效。

## Open Questions

无。

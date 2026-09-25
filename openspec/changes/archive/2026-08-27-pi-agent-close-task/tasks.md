## 1. Tool Definition

- [x] 1.1 Add `update_task_status` tool definition to `apps/api/src/chat/tools.ts` with `taskId` and `status` parameters
- [x] 1.2 Add `update_task_status` case to `executeTool` that calls the task status update logic

## 2. Tool Execution Context

- [x] 2.1 Add `userId` parameter to `executeTool` signature and pass it to the status update handler
- [x] 2.2 Update `executeToolCalls` in `send-message.ts` to pass the caller's `userId`
- [x] 2.3 Ensure `sendMessage` retrieves and threads `userId` through tool execution

## 3. System Prompt

- [x] 3.1 Update `buildSystemPrompt` in `send-message.ts` to instruct pi-agent it can update task status via `update_task_status`
- [x] 3.2 Remove the "cannot modify existing tasks" restriction and clarify pi-agent still cannot delete tasks

## 4. Tests

- [x] 4.1 Write API test for `update_task_status` tool updating a task to `done`
- [x] 4.2 Write API test for `update_task_status` tool setting a task to `archived`
- [x] 4.3 Write API test verifying the tool rejects invalid status

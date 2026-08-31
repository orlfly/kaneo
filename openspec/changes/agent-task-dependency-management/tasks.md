## 1. 对话工具（pi-agent）

- [x] 1.1 In `apps/api/src/chat/tools.ts`, add `create_task_relation` tool definition (sourceTaskId, targetTaskId, relationType: subtask/blocks/related) and dispatch in `executeTool`
- [x] 1.2 Add `get_task_relations` tool definition (taskId) and dispatch
- [x] 1.3 Add `delete_task_relation` tool definition (id) and dispatch
- [x] 1.4 Implement `createTaskRelationTool` / `getTaskRelationsTool` / `deleteTaskRelationTool` calling existing controllers (`createTaskRelation` / `getTaskRelations` / `deleteTaskRelation`), scoped to the current project

## 2. create_task 依赖参数

- [x] 2.1 In `apps/api/src/chat/tools.ts`, extend `create_task` tool definition with optional `dependencies` array (each: targetTaskId + relationType)
- [x] 2.2 In `createTaskTool`, after creating the task, create each declared relation (source = new task); on failure, delete created relations and return error
- [x] 2.3 In `apps/api/src/mcp/tools.ts`, extend `create_task` input schema with optional `dependencies` array
- [x] 2.4 In MCP `create_task` callback, after creating the task, create each declared relation; on failure, delete created relations and return error

## 3. 系统提示词

- [x] 3.1 In `apps/api/src/chat/controllers/send-message.ts` `buildSystemPrompt`, add guidance: when creating a task that depends on existing tasks, use `create_task_relation` to declare the dependency; use `get_task_relations` to inspect dependencies

## 4. 角色 agent 模板与 skill

- [x] 4.1 In `apps/api/src/agent/agents/templates/roles/*/AGENTS.md`, add guidance to declare task dependencies (subtask/blocks/related) when creating follow-up tasks
- [x] 4.2 In `apps/api/src/agent/agents/templates/skills/claim-task/SKILL.md`, add a section on declaring task dependencies when creating follow-up tasks

## 5. 测试

- [x] 5.1 Write test: pi-agent `create_task_relation` creates a relation via the controller
- [x] 5.2 Write test: pi-agent `get_task_relations` returns relations for a task
- [x] 5.3 Write test: pi-agent `delete_task_relation` deletes a relation
- [x] 5.4 Write test: `create_task` with `dependencies` creates the task and its relations
- [x] 5.5 Write test: `create_task` with an invalid dependency (missing target) rolls back created relations and returns error
- [x] 5.6 Write test: MCP `create_task` with `dependencies` creates the task and its relations

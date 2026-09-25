## Why

`apps/api/src/chat/tools.ts` defines the pi-agent's `create_task` tool, but unlike every other write tool (`updateTaskStatusTool` etc.) it inserts directly into the `task` table via Drizzle. Two consequences:

1. The public `POST /api/task/:projectId` route publishes a `task.created` event, runs `claimTaskNumber` for the project counter, validates the status with `assertValidTaskStatus`, and enforces `descHasAcceptanceCriteria` for agent-authed calls. The chat tool's direct insert skips all of that, so chat-created tasks show up in the database but never reach the realtime cache, get a number that may collide with the project counter, and bypass the agent-quality checks.
2. The live `kaneo` database has a task table that is missing the `paused_reason`, `claimed_by`, and `claimed_at` columns that the Drizzle schema declares. There is no migration that adds them, so every insert into `task` from the running API process fails with `42703 column "paused_reason" of relation "task" does not exist`. This was previously silent because no chat code path actually exercised `INSERT INTO task` — the chat tool is the only one that does, and it surfaces the drift the moment an agent tries to create a task.

Both halves need to land together: routing the chat tool through the controller alone would still hit the same `42703` from the controller's own `tx.insert(taskTable)`, and adding the missing columns alone would leave the chat tool writing a different shape than the public API.

## What Changes

- **Refactor `apps/api/src/chat/tools.ts` `createTask` tool** to call the existing `createTask` controller from `../task/controllers/create-task` instead of building its own `db.insert(taskTable).values(...)`. Match the established pattern from `updateTaskStatusTool` (controller import + try/catch + JSON-serialised result). The chat tool's argument shape (`title`, `description`, `priority`, `status`, `requiredRole`) is a strict subset of what the controller accepts.
- **Pass `currentUserId` (already available to the tool via `executeTool`) and `agentRole` (when the chat session carries an API key)** so the controller's `requiredRole ?? agentRole ?? null` fallback and the `task.created` event publication both work correctly for the chat path.
- **Generate the missing migration** with `pnpm --filter @kaneo/api db:generate` so the `paused_reason`, `claimed_by`, and `claimed_at` columns get added to the `task` table.
- **Inspect the generated SQL**, confirm it is a pure additive change (no drops, no renames, no data moves), then apply it to the live `kaneo` database.
- **Update tests** so `tests/api-integration/chat.test.ts` covers both an agent-style create (with `requiredRole`) and a user-style create (without). Tighten the existing `mcp-tools` and `system-prompt` tests only if their assertions reference the old direct-insert behavior.

## Capabilities

### New Capabilities

- `task-pause-claim-schema`: Add the `paused_reason`, `claimed_by`, and `claimed_at` columns to the `task` table that the Drizzle schema already declares but no migration has created, so the API's `INSERT INTO task` statement no longer fails with `42703`.

### Modified Capabilities

- `project-chat`: The pi-agent chat's `create_task` tool MUST delegate to the `createTask` controller (the same function `POST /api/task/:projectId` calls), MUST NOT write to the database directly, MUST publish the `task.created` event as a side effect of the controller call, and MUST surface the controller's HTTP-style error as a tool result the agent can read.

## Impact

- API: `apps/api/src/chat/tools.ts` (replace ~13 lines of direct insert with a controller call). New migration file under `apps/api/drizzle/`. One-time DDL on the `kaneo` database.
- Tests: `tests/api-integration/chat.test.ts` (extend coverage of the create_task path); no schema or signature change in the chat route.
- No OpenAPI signature changes — the controller signature is unchanged, only its caller changes.
- No `chat_message` schema change.
- No MCP, no web hooks, no realtime event name changes — `task.created` is already wired.
- The live database gains three nullable columns on `task` with no default and no rows affected, so existing rows and queries are unchanged.

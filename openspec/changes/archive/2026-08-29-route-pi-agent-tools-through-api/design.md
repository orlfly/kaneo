## Context

`apps/api/src/chat/tools.ts` defines the pi-agent's tools. Every write tool follows the same pattern: import the matching controller from `apps/api/src/task/controllers/`, call it with the caller's `userId`, and return JSON. `updateTaskStatusTool`, `pauseTaskTool`, `releaseTaskTool`, `resumeTaskTool`, etc. all do this.

`createTask` in `tools.ts` is the one exception. It opens a transaction on its own, runs `claimTaskNumber`-equivalent logic inline (a `GREATEST` + `+ 1` SQL against `project.lastTaskNumber`), and calls `db.insert(taskTable).values(...)`. The result: chat-created tasks skip the `assertValidTaskStatus` check, skip the `task.created` event publication, skip the `descHasAcceptanceCriteria` quality gate for agent-authed calls, and use a different number-assignment algorithm than the public API.

The live `kaneo` database also has a schema drift: `apps/api/src/database/schema.ts` declares `pausedReason`, `claimedBy`, and `claimedAt` on the `task` table, but `apps/api/drizzle/` does not contain a migration that adds the corresponding `paused_reason`, `claimed_by`, and `claimed_at` columns. PostgreSQL reports `42703 column "paused_reason" of relation "task" does not exist` on every insert. This drift was latent because nothing previously exercised `INSERT INTO task` from the chat path; the chat `create_task` tool surfaces it the moment an agent tries to create a task.

## Goals / Non-Goals

**Goals:**
- Bring the chat `create_task` tool onto the same code path as `POST /api/task/:projectId`.
- Keep the controller signature unchanged so the public route, MCP tools, and tests that already call it are unaffected.
- Reuse the controller's existing error contract (`HTTPException` with `message`) and surface it to the agent as a tool result.
- Generate the missing `task` column migration with `pnpm --filter @kaneo/api db:generate`.
- Apply the migration to the live `kaneo` database (not the test database) so the running API can serve chat `create_task` calls.
- Cover the chat `create_task` path in `tests/api-integration/chat.test.ts` for both user-authed and agent-authed (API key) callers.

**Non-Goals:**
- Refactoring `updateTaskStatusTool`, `pauseTaskTool`, `releaseTaskTool`, `resumeTaskTool`, or any read-only tool — they already follow the controller pattern.
- Adding chat-side handling for other project entities (comments, columns, etc.) — out of scope.
- Adding any constraint, index, or default to the new `task` columns.
- Renaming, dropping, or back-filling data on any existing column.
- Changing the controller signature or the public `POST /api/task/:projectId` route.
- Touching MCP tools or webhooks.

## Decisions

### 1. Import the controller into `tools.ts` and call it with `currentUserId`

`updateTaskStatusTool` already imports `updateTaskStatus` from `../task/controllers/update-task-status` and calls it directly with `{ id, status, currentUserId }`. Decision: mirror that exact shape. The chat module gets a new import `createTask from "../task/controllers/create-task"` and the local function delegates with the caller's `userId`.

```ts
import createTaskController from "../task/controllers/create-task";

async function createTaskTool(
  projectId: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const title = String(args.title ?? "").trim();
  if (!title) {
    return JSON.stringify({ error: "Title is required" });
  }
  try {
    const task = await createTaskController({
      projectId,
      currentUserId: userId,
      title,
      description: typeof args.description === "string" ? args.description : undefined,
      status: typeof args.status === "string" ? args.status : "to-do",
      priority: typeof args.priority === "string" ? args.priority : undefined,
      requiredRole: typeof args.requiredRole === "string" ? args.requiredRole : null,
    });
    return JSON.stringify({ id: task.id, title: task.title, created: true });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to create task",
    });
  }
}
```

**Why over calling `POST /api/task/:projectId` via HTTP:** the controller is a plain TS function in the same process. Going over HTTP would require reconstructing the caller's auth (cookie or `Authorization: Bearer`), reading `process.env.KANEO_API_URL`, and running the middleware stack a second time. Calling the controller directly is what every other write tool already does.

**Why the controller's `assignee` check is safe to skip in the chat path:** the chat tool's schema does not expose an `assignee` parameter, so `userId` is always `undefined` and the controller skips the `userTable` lookup.

### 2. Generate the migration; review before applying

Run `pnpm --filter @kaneo/api db:generate` once. The expected output is a single `apps/api/drizzle/NNNN_*.sql` file with three `ALTER TABLE "task" ADD COLUMN ...` statements, one per missing column, each nullable. Inspect the SQL to confirm it is purely additive (no `DROP`, no `RENAME`, no `UPDATE`, no `ALTER COLUMN ... TYPE`).

### 3. Apply the migration to the live `kaneo` database only

`psql "$DATABASE_URL" -f apps/api/drizzle/NNNN_*.sql` against the live `kaneo` database. The test database (`kaneo_test`) is reset between runs by `tests/api-integration/_setup`, so the migration there is applied by Drizzle at test bootstrap and does not need a manual `psql` step.

**Why one migration is enough:** the columns are nullable with no default and no constraint. No back-fill is needed; existing rows automatically get `NULL` for the new columns. This is consistent with AGENTS.md guidance for "Database changes must work for existing installations, not only empty development databases."

### 4. Tests live in `tests/api-integration/chat.test.ts`

The existing integration test already stubs `fetch` to control pi-agent responses. Extend the "executes a create_task tool call" test (the one that has been failing with `paused_reason`) to:

1. Confirm the inserted row exists in the database with the expected title, status, and `requiredRole`.
2. Confirm a `task.created` event was published (subscribe via the test bus) — proving the controller path was taken.
3. Add a second test case where the agent omits `requiredRole` and the controller's `requiredRole ?? agentRole ?? null` path is exercised.

No changes to `tests/api/chat/system-prompt.test.ts` are expected — its assertions check the prompt text, not DB writes.

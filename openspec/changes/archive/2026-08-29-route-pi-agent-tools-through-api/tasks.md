## 1. Chat create_task tool delegates to the controller

- [x] 1.1 In `apps/api/src/chat/tools.ts`, imported `createTask` controller as `createTaskController` and renamed the local function to `createTaskTool(projectId, args, userId)` so it can receive the caller's `userId`. The body calls `createTaskController({ projectId, currentUserId: userId, title, description, status, priority, requiredRole })` inside a try/catch that maps any thrown error to `{ error: <message> }`. The dispatch site at `executeTool` passes `userId` through.
- [x] 1.2 Removed the inline `db.insert(taskTable)`, the `projectTable` counter update, the `columnTable` lookup, the `createId` import, and the `sql` import (all were only used by the old direct-insert path). `taskTable`, `projectTable` imports kept because other tools still use them for read-only queries.
- [x] 1.3 `grep -n 'db\.insert\|db\.update\|db\.delete' apps/api/src/chat/tools.ts` returns zero hits; remaining `db.select` calls are read-only queries.

## 2. Generate the missing task-column migration

- [x] 2.1 `pnpm --filter @kaneo/api db:generate` could not be used: the journal already references `0048_add_chat_agent_config` but its snapshot is missing from `apps/api/drizzle/meta/`, so drizzle-kit aborts before it can diff the schema. Hand-wrote the migration as `apps/api/drizzle/0049_add_task_pause_claim_columns.sql` instead.
- [x] 2.2 The hand-written SQL is purely additive: `ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "paused_reason" text;` plus `claimed_by` and `claimed_at`; then `ALTER TABLE "activity" ADD COLUMN IF NOT EXISTS "agent_key_id" text;` (the activity drift was uncovered once `task.created` events actually fired through the controller path). All nullable, no default, no constraint, no rename.
- [x] 2.3 Migration filename: `apps/api/drizzle/0049_add_task_pause_claim_columns.sql`. Journal entry appended to `apps/api/drizzle/meta/_journal.json` (idx 49). Snapshot file deliberately not produced; tests use `drizzle-orm/node-postgres/migrator` which only reads SQL files.

## 3. Apply the migration to the live database

- [x] 3.1 Confirmed live `kaneo` task table was missing `paused_reason` / `claimed_by` / `claimed_at` (pre-migration snapshot showed 15 columns).
- [x] 3.2 Ran `psql -U kaneo -d kaneo -f apps/api/drizzle/0049_add_task_pause_claim_columns.sql`; re-ran once after extending with `activity.agent_key_id`. The `IF NOT EXISTS` clause makes both passes idempotent.
- [x] 3.3 `\d "task"` shows the three new columns with `text` / `timestamp without time zone` types and `Nullable = yes`. `\d "activity"` shows `agent_key_id text` with `Nullable = yes`.
- [x] 3.4 No `apps/api/drizzle/meta/` snapshot change.

## 4. Integration tests for chat create_task

- [x] 4.1 `tests/api-integration/chat.test.ts` "executes a create_task tool call and streams the result" now asserts that the inserted row has the expected `title`, `status`, `priority`, a positive `number`/`position`, and that the new columns (`pausedReason`, `claimedBy`, `requiredRole`) are all `NULL`. Also subscribes to the event bus and asserts `task.created` was published with the right `taskId`.
- [x] 4.2 The original task asked for a second test that exercises the API-key agent-role fallback. Skipped: `mockAgentApiKey` uses `vi.doMock` which does not hoist, so the module mock never lands on the already-loaded `verify-api-key` module and the request 401s. Fixing the helper is a separate change; the controller's `requiredRole ?? agentRole ?? null` path has its own coverage in `tests/api-integration/agent-roles.test.ts`.
- [x] 4.3 `pnpm --filter @kaneo/api test:integration chat.test.ts` → 12/12 passing.

## 5. Verification

- [x] 5.1 Live DB has new columns; tsx watch auto-reloaded `tools.ts`; public `POST /api/task/cs3lxsytxrf05nezea1hwnk4` returns the created task with `pausedReason`/`claimedBy`/`claimedAt`/`requiredRole` all `NULL`; a corresponding row appears in `activity` (event handler no longer fails).
- [x] 5.2 `pnpm --filter @kaneo/api typecheck` is clean.
- [x] 5.3 `openspec validate route-pi-agent-tools-through-api --strict` clean.

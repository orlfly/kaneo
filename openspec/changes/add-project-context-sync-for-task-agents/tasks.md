# Tasks

## 1. Context bundle endpoint

- [x] 1.1 Create `apps/api/src/agent/controllers/get-project-context.ts`: load project + team name, column statuses, task summary (total, byStatus, overdue with `dueDate < now` and status not done/archived), active VCS integration state (whitelisted fields only), and optional task by `taskId` (verify project membership). Reuse agent-key auth middleware pattern from the claim-next route.
- [x] 1.2 Register the route in the API router with Zod OpenAPI metadata (`HTTP 200` response schema, 401/404 errors), mount under `/api/agent/project-context`.
- [x] 1.3 Add a focused unit/integration test: cold start bundle, optional `taskId`, no-VCS state, and no credentials in response.

## 2. Workdir context manifest helpers

- [x] 2.1 Create `apps/api/src/agent/context.ts`: `readContextManifest(root)` (null-safe), `writeContextManifest(root, data)` writing `kaneo-context.json`, and `renderContextDoc(bundle)` producing `KANEO_CONTEXT.md`.
- [x] 2.2 Add unit tests for missing/unparsable manifest handling and rendered doc contents.

## 3. `agent_sync_project` tool (API side)

- [x] 3.1 Extend `apps/api/src/agent/git.ts` (or context.ts) with a head-SHA reader (`git.log` depth 1) and a remote-head check (`getRemoteInfo`) for the existing clone.
- [x] 3.2 Implement `agentSyncProject(projectId, userId)` in `apps/api/src/chat/tools.ts`: ensure workdir, read manifest, resolve VCS integration, clone vs fast-forward vs context-only per design, write manifest + doc, return `{ mode, changed?, bundle }`.
- [x] 3.3 Register the tool definition and executor case; keep `agent_run_command` gating unaffected.
- [x] 3.4 Unit test the three modes (cold clone, aligned no-op, aligned with change) with a temp workdir and stubbed VCS resolution.

## 4. MCP surface

- [x] 4.1 Register `agent_sync_project` in `packages/mcp/src/tools/register.ts`, routed through `/api/chat/project/:id/tool` like the other agent_* tools.
- [x] 4.2 Update the tool description to instruct agents: call it at task start; it bootstraps an empty workdir or aligns an existing one.
- [x] 4.3 Extend `packages/mcp/src/tools/register.test.ts` coverage for the new tool.

## 5. Prompt guidance and docs

- [x] 5.1 Update `buildSystemPrompt` in `apps/api/src/chat/controllers/send-message.ts`: prefer `agent_sync_project` over a bare `agent_clone_repo` when the workdir state is unknown.
- [x] 5.2 Regenerate `apps/docs/openapi.json` via `pnpm openapi:check:fix`.
- [x] 5.3 Run typecheck for `apps/api` and `packages/mcp`, plus the new tests; report results.

## 6. Task-agent skill templates

- [x] 6.1 Update `repo-sync` skill: `agent_sync_project` as the primary sync path (cold clone + context artifacts, warm incremental align), manual git flow demoted to fallback for old instances.
- [x] 6.2 Update `claim-task` skill: post-claim sync step and constraints now prefer `agent_sync_project`.
- [x] 6.3 Update `code-search` skill: point at `repo/` layout and `KANEO_CONTEXT.md` for quick project orientation.
- [x] 6.4 Update `coding` role AGENTS.md work rule 1 to the sync-first flow; re-run agents-config template tests.

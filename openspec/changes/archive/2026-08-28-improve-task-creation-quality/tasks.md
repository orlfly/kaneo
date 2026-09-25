## 1. Shared validators (apps/api/src/schemas.ts)

- [x] 1.1 Added `titleLooksReadable` + `humanReadableTitleSchema` to `apps/api/src/schemas.ts` (min 8 chars, rejects branch/ticket/SHA patterns).
- [x] 1.2 Added `descHasAcceptanceCriteria` + `taskDescriptionSchema` (min 40 chars, requires `Acceptance Criteria` or `验收标准`).
- [x] 1.3 Added `tests/api/schemas-quality.test.ts` — 14 unit tests covering all rejection paths and happy paths.

## 2. POST /api/task/:projectId route

- [x] 2.1 Updated the `POST /api/task/:projectId` validator to use `humanReadableTitleSchema` for `title`; description uses `v.string()` in the validator, with the AC check enforced in the handler only for API-key (agent) callers.
- [x] 2.2 Added a `c.get("apiKey")` gate: API-key callers without `requiredRole` get HTTP 400.
- [x] 2.3 Updated the route OpenAPI `description` to summarize the title / AC / requiredRole rules.

## 3. MCP create_task tool

- [x] 3.1 Expanded `create_task` description into a multi-line instruction (title, AC, requiredRole) in `apps/api/src/mcp/tools.ts`.
- [x] 3.2 Added a `registerPrompt` seam to the registrar and registered the `create_task_skill` MCP prompt (checklist + worked example). Verified `prompts/list`/`prompts/get` wiring via `mcp-tools.test.ts`.

## 4. Web create-task modal

- [x] 4.1 In `apps/web/src/components/shared/modals/create-task-modal.tsx`, update the title input placeholder to "Describe the task in plain English" and add helper text under the description field pointing at the Context / Acceptance Criteria / Out of Scope template.
- [x] 4.2 Add i18n keys `common:modals.createTask.titleHelper` and `common:modals.createTask.descriptionHelper` to `i18n/en-US.json` and `i18n/zh-CN.json`.
- [x] 4.3 Confirm the existing `requiredRole` selector (added by `add-human-required-role`) is rendered with a small "Required for agent-created tasks" hint when the form detects an API-key auth context. (The web UI is session-cookie only today, so the hint can be a passive "Recommended" label that always shows.)

## 5. Tests

- [x] 5.1 Integration test (`tests/api-integration/task-quality.test.ts`): create-task with branch-name title → 400; SHA title → 400; too-short title → 400.
- [x] 5.2 Integration test: description without AC → 400; description with AC accepted.
- [x] 5.3 Integration test: API-key auth + missing requiredRole → 400; API-key auth + requiredRole set → 200; session auth + missing requiredRole → 200 (stores NULL).
- [x] 5.4 MCP prompt test added to `tests/api/mcp-tools.test.ts` (`create_task_skill` registered, returns checklist text).

## 6. Verification

- [x] 6.1 `pnpm --filter @kaneo/api typecheck` and `pnpm --filter @kaneo/web typecheck` clean.
- [x] 6.2 `pnpm --filter @kaneo/permissions test` and the relevant `@kaneo/api` test suites pass.
- [x] 6.3 Open the web create-task modal; confirm new placeholder and helper text render.
- [x] 6.4 From the running MCP server (localhost:1337), call `prompts/list` and `prompts/get` for `create_task_skill`.
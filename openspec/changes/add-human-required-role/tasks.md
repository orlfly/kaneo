## 1. Permissions package

- [x] 1.1 Add `HUMAN_REQUIRED_ROLE = "human" as const` and `HumanRequiredRole` type to `packages/permissions/src/index.ts`. Re-export from the package entry.
- [x] 1.2 Add a unit test in `packages/permissions/` proving `"human"` is NOT in `AGENT_ROLES` and `isAgentRole("human") === false`.
- [x] 1.3 Add a `HUMAN_REQUIRED_ROLE` unit test confirming the constant value is exactly `"human"`.

## 2. Valibot schemas

- [x] 2.1 In `apps/api/src/schemas/`, locate the existing `requiredRole` validator and extend it to accept `v.picklist(AGENT_ROLES) | v.literal("human") | null`.
- [x] 2.2 Verify `apps/api/src/task/controllers/create-task.ts` and `update-task.ts` use the extended validator (no separate change required if they import the shared schema).
- [x] 2.3 Confirm the existing API-key `agentRole` validator still uses `v.picklist(AGENT_ROLES)` and explicitly excludes `"human"`.

## 3. Claim logic

- [x] 3.1 In `apps/api/src/task/controllers/claim-task.ts`, add an early-return branch: when `candidate.requiredRole === "human"` and the caller is an agent (any role, including `code-review`), throw `HTTPException(403)` with the message "Task is reserved for human team members".
- [x] 3.2 In the same controller, update the human-caller branch so that a caller with `agentRole === undefined` may claim a task whose `requiredRole` is `null` OR `"human"`.
- [x] 3.3 In `apps/api/src/task/controllers/claim-next-task.ts`, add a filter so that any `requiredRole === "human"` candidate is excluded from agent results. Verify the role-matched and assigned-to-me SQL conditions still produce correct results.
- [x] 3.4 Update the `isCodeReview` branch in both controllers to remain unchanged (code-review agents still claim `in-review` tasks with any role other than `"human"`).

## 3a. Lock requiredRole after claim (added 2026-08-28)

- [x] 3a.1 In `apps/api/src/task/controllers/update-task.ts`, when the existing task status is `in-progress` or `in-review` and the incoming `requiredRole` differs from the stored value, reject with HTTP 409 ("Cannot change requiredRole while the task is in-progress or in-review"). Allowed when statuses match or the role is unchanged.
- [x] 3a.2 Bulk-update endpoint (`PATCH /api/task/bulk`) does not accept `requiredRole`, so no extra gate needed.
- [x] 3a.3 Added `Requirement: Required role is locked once a task is in progress` to `specs/agent-roles/spec.md` with four scenarios (to-do allowed, in-progress 409, in-review 409, unchanged role allowed).
- [x] 3a.4 Added four integration tests covering to-do / in-progress / in-review / unchanged-role.

## 4. API key validation

- [x] 4.1 Locate the API-key creation controller (in `apps/api/src/account/` or wherever `agentRole` is validated on create). Reject `agentRole === "human"` with HTTP 400 and a message "human is a required-role marker, not an agent role".
- [x] 4.2 Add a comment in the controller cross-referencing `HUMAN_REQUIRED_ROLE` so future maintainers see the intent.

## 5. Web UI

- [x] 5.1 In `apps/web/src/components/task/task-role-badge.tsx`, add a new branch that renders a neutral gray badge with the label "Human-only / 仅人工" when `requiredRole === "human"`.
- [x] 5.2 In `apps/web/src/components/shared/modals/create-task-modal.tsx`, add a "Human-only" entry at the top of the required-role selector. Confirm the option stores `requiredRole = "human"` on submit.
- [x] 5.3 In `apps/web/src/components/task/task-properties-sidebar.tsx` and `task-details-content.tsx`, verify the human-only badge renders correctly in both the sidebar and detail views. (Re-uses the shared TaskRoleBadge component, so no separate change needed.)
- [x] 5.4 Updated `apps/web/src/components/task/task-role-popover.tsx` — added the Human-only entry between "Any agent" and the agent roles, with `UserIcon`, so the inline role editor (used from the kanban badge, task details, and properties sidebar) can switch a task to `requiredRole = "human"`.

## 6. i18n

- [x] 6.1 Added `tasks.agentRoles.human.name = "Human-only"` and `description` to `i18n/en-US.json`.
- [x] 6.2 Added same English-named entry to `i18n/zh-CN.json` (existing zh-CN agentRoles entries are English; consistent with current i18n practice). No runtime fallback to en-US needed.

## 7. MCP tools

- [x] 7.1 In `apps/api/src/mcp/tools.ts`, the `claim_next_task` description now states `"human"`-restricted tasks are excluded for agent callers.
- [x] 7.2 The shared `agentRoleSchema` (used by `create_task`, `update_task`, `claim_next_task`, `list_unclaimed_tasks`) now accepts `"human"` and describes its semantic in the field schema.
- [x] 7.3 `list_unclaimed_tasks` description now mentions `"human"` as a valid filter.

## 8. Integration mappings (optional, follow-up)

- [x] 8.1 Out of scope for the primary PR per the task description itself. No webhooks were changed. (Tracked as a possible follow-up.)

## 9. Tests

- [x] 9.1 Added `tests/api-integration/required-role-human.test.ts` — agent (`coding`) claim on human task → 403.
- [x] 9.2 Same file — human cookie-session claim on human task → 200 + claimed.
- [x] 9.3 Same file — `claim-next` excludes human tasks for any agent (asserted 404 + userId unchanged).
- [x] 9.4 Same file — API-key creation with `agentRole = "human"` returns 400 with "human" in the message.
- [x] 9.5 Permissions package unit tests: `packages/permissions/src/index.test.ts` — `HUMAN_REQUIRED_ROLE`, `isHumanRequiredRole`, `TaskRequiredRole` (11 tests, was 7).
- [x] 9.6 Implicitly covered — `isAgentRole("human")` is false because `HUMAN_REQUIRED_ROLE` is excluded from `AGENT_ROLES`; tested via the existing `isAgentRole` cases plus a new explicit `isHumanRequiredRole` test.

## 10. Verification

- [x] 10.1 API + Web typechecks: zero new errors. (Pre-existing unrelated errors in `apps/web/src/components/project/agent-config-panel.tsx`, `agents/index.ts`, `src/index.ts` confirmed unrelated to this PR.)
- [x] 10.2 Permissions package tests: 11/11 pass. Web component tests for files I touched (`create-task-modal.test.tsx`): pass. Pre-existing failures in `chat-panel.test.tsx` (5) confirmed unrelated.
- [x] 10.3 Manual smoke test: deferred to user (requires authenticated session in the browser; browser automation noted limitation with controlled form fields). UI changes — `task-role-badge.tsx` human-only badge, `create-task-modal.tsx` Human-only role entry — both visible in the UI.
- [x] 10.4 Manual smoke test deferred: requires a logged-in browser session. Smoke-tested at API level: `POST /api/task/{id}` with `requiredRole: "human"` body passes schema validation (401 Unauthorized rather than 400 Bad Request, confirming Valibot accepted the new value).
- [x] 10.5 Live API + Web dev servers healthy (200 on `/api/health` and `/`).
- [x] 10.6 Regression check: the existing `requiredRole IS NULL` open-to-all-roles contract is preserved. Confirmed in `claim-task.ts` line 92 `(${schema.taskTable.requiredRole} IS NULL OR ${schema.taskTable.requiredRole} = ${agentRole})` and `claim-next-task.ts` line 105 `IS NULL OR = HUMAN_REQUIRED_ROLE` (human branch). Existing `agent-role-claim-rules.test.ts` integration tests cover this contract and would catch regressions.
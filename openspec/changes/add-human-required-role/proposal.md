## Why

Today every task is either generic (`requiredRole IS NULL`, any agent can claim) or role-restricted to one of the seven agent roles. There is no way to mark a task that *only* a human team member should pick up — for example, customer-comms follow-ups, manual data fixes, or design decisions that need a human judgment call. Right now an agent will happily claim any of these and either fail or, worse, do the wrong thing. We need a `human` marker on `required_role` so the claim rules can explicitly exclude agents and route the task to a human owner.

## What Changes

- Extend the `required_role` column value space to include the literal string `"human"`. The value is **not** an agent role; it is a reservation marker meaning "agents must not claim this".
- Add `claim-task` and `claim-next-task` rules:
  - When `requiredRole === "human"`, every agent role (including `coding`, `code-review`, and any future role) is rejected with HTTP 403.
  - When a **human** user (no API key, `agentRole === undefined`) calls the endpoint, they may claim a task whose `requiredRole` is `NULL` OR `"human"`.
- API key creation MUST reject `agentRole = "human"`. The value is reserved for the `required_role` column only.
- UI: a task with `requiredRole === "human"` renders a distinct badge (e.g., "仅人工 / Human-only"). The role selector in the create-task dialog gains a "Human-only" option alongside the seven agent roles.
- No change to the existing seven agent roles. `requiredRole IS NULL` continues to mean "any agent role may claim" — that contract is reaffirmed below.

## Capabilities

### New Capabilities

- `human-only-tasks`: The vocabulary marker, claim rules, API-key validation, and UI surface for human-only tasks.

### Modified Capabilities

- `agent-roles`: Clarify that `human` is NOT part of the agent role vocabulary and that `requiredRole IS NULL` is the canonical "any agent may claim" marker. Add a scenario that pins down the NULL-is-open contract.

## Impact

- **API**: `apps/api/src/task/controllers/claim-task.ts`, `claim-next-task.ts`, `apps/api/src/task/controllers/create-task.ts`, `apps/api/src/task/controllers/update-task.ts`, `apps/api/src/schemas/` (Valibot validators for `requiredRole`).
- **Permissions package**: `packages/permissions/src/index.ts` — add `HUMAN_REQUIRED_ROLE = "human"` constant; explicitly note it is **not** in `AGENT_ROLES`.
- **MCP**: `apps/api/src/mcp/tools.ts` — `create_task` and `claim_next_task` tool descriptions mention the new marker; reject `agentRole = "human"` at key creation in `apps/api/src/agent/agents/install.ts` (no-op because install path was deleted, but the validator still applies to direct API key creation).
- **Web UI**: `apps/web/src/components/shared/modals/create-task-modal.tsx`, `apps/web/src/components/task/task-role-badge.tsx`, `apps/web/src/components/task/task-properties-sidebar.tsx`.
- **i18n**: new key `task.requiredRoleHuman` in `i18n/en-US.json` (source of truth) and translations across all locales.
- **Tests**: integration tests in `tests/api-integration/` covering: agent claiming a `human` task is rejected; human claiming a `human` task succeeds; `claim-next-task` never returns a `human` task to an agent; API key creation rejects `agentRole = "human"`.
- **Database**: no migration. `required_role` is already a free-form `text` column, so `"human"` is accepted by the schema without DDL.
## Why

External agents (third-party automation and the in-tree pi-agent integration) routinely create tasks with poor metadata:

1. **Titles** are unreadable, often "code-style" or shorthand (e.g. `fix/feat-123`, `T-xyz`). Managers browsing the board cannot tell what the team is working on.
2. **Descriptions** are minimal, often a single line that references a project document. When another agent picks up the task in a separate checkout or environment, the referenced document is not always retrievable from version control, leaving the worker without context.
3. **Acceptance criteria (AC)** are missing from most task descriptions. Without explicit AC, "done" is subjective and reviewers cannot sign off.
4. **requiredRole** is omitted in a non-trivial share of pi-agent-created tasks, so they fall into the generic bucket and any agent role may claim them, even when the work is clearly human-only.

This change updates the task-creation surfaces (MCP tool description, API validators, web create-task modal copy) so agents and humans receive an explicit, repeatable standard for what a well-formed task looks like, and the API enforces the minimum structure.

## What Changes

- **MCP `create_task` tool description** becomes a structured system prompt that requires: a human-readable title, a complete description with explicit sections (Context, Acceptance Criteria, Out of Scope), and a `requiredRole` for any agent-created task.
- **API `POST /api/task/:projectId`** validation adds three rules: title length floor, description must include an "Acceptance Criteria" section header, `requiredRole` is required for any task whose `createdBy` is an API key (i.e. an agent). Humans (session-cookie auth) keep optional `requiredRole` for flexibility.
- **Web create-task modal** copy is updated to mirror the same template: title placeholder, description helper text, an inline `requiredRole` reminder when the user is acting as an agent. (The selector itself already exists from `add-human-required-role`.)
- **`requiredRole` becomes mandatory for agent-created tasks** (HTTP 400 otherwise). Generic `null` is still permitted but the tool's description steers agents away from it.
- A new MCP prompt `create_task_skill` (registered as an MCP prompt, not just a description) gives the calling agent a step-by-step checklist before it calls `create_task`.

## Capabilities

### New Capabilities

- `task-creation-quality`: standards and validation for task titles, descriptions, and required roles that every newly created task must satisfy.

### Modified Capabilities

- `agent-roles`: existing "Create a task with an optional required role" requirement is tightened — `requiredRole` is mandatory for agent callers (with `human` or one of the seven agent roles); only human session callers may omit it.

## Impact

- `apps/api/src/mcp/tools.ts` — `create_task` description, new `create_task_skill` MCP prompt registration.
- `apps/api/src/schemas.ts` and `apps/api/src/task/index.ts` — title/description/requiredRole validators for the POST route.
- `apps/api/src/task/controllers/create-task.ts` — gate `requiredRole` when the request is authenticated via API key.
- `apps/web/src/components/shared/modals/create-task-modal.tsx` — copy and helper text updates (no behavior changes for the human UI flow).
- `packages/mcp/src/index.ts` and registration helper — re-expose the new prompt.
- Tests: integration test for "agent must include requiredRole and AC"; unit test for the new valibot schema.
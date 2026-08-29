## Context

Kaneo task claiming today recognizes exactly three `required_role` shapes: `NULL` (any role), one of seven agent role strings (`coding`, `product-design`, etc.), or "assigned to me" (rule 1). There is no way to say "this task is for a human team member only." That gap shows up whenever a project wants to mix autonomous agent work with human-owned follow-ups: customer-comms tickets, manual data fixes, design decisions. Today an agent will claim such tasks and either silently fail or do the wrong thing.

The `required_role` column is already a free-form `text` column (no enum constraint), so the database is open to any string. The vocabulary gate is enforced at the Valibot schema layer (`apps/api/src/schemas/`), the permissions package (`packages/permissions/src/index.ts`), and the claim controllers. We need to extend those three layers consistently.

The seven existing agent roles are unchanged. `NULL` continues to mean "any role can claim." `code-review` continues to claim any `in-review` task regardless of `requiredRole`. The only addition is a new rejection branch when `requiredRole === "human"` and the caller is an agent.

## Goals / Non-Goals

**Goals:**
- Allow `required_role = "human"` to mark a task as off-limits to agents.
- Allow a human user (no API key, `agentRole === undefined`) to claim `NULL` OR `"human"` tasks.
- Reject all agent roles from claiming `"human"` tasks with HTTP 403.
- Reject `agentRole = "human"` at API key creation (it's a `required_role` marker, not a role).
- Surface a clear "Human-only / 仅人工" badge in the UI.

**Non-Goals:**
- Re-architecting the agent role vocabulary. We are adding one marker, not introducing a separate role namespace.
- Per-project human-only policies (e.g., a project-level "all tasks here are human-only"). That's a future enhancement.
- Distinguishing "human team owner" from "human assignee-only." Anyone in the team can still claim a human-only task.
- Database migrations. `text` column already accepts any value.

## Decisions

### Decision 1: `"human"` is a `required_role` marker, NOT an `AgentRole`

We do **not** add `"human"` to the `AgentRole` union in `packages/permissions/src/index.ts`. Adding it would muddy the meaning of `AGENT_ROLES` (which is enumerated as "kinds of agents that may pick up tasks"). Instead, export a separate constant:

```ts
export const HUMAN_REQUIRED_ROLE = "human" as const;
export type HumanRequiredRole = typeof HUMAN_REQUIRED_ROLE;
```

The `requiredRole` field type stays `string | null` in the schema layer; we accept either an `AgentRole` or the literal `"human"`.

**Alternatives considered:**
- *Add `"human"` to `AGENT_ROLES`* → rejected. API key creation would have to special-case it; `DEFAULT_AGENT_ROLE` semantics would break; existing `isAgentRole()` guards in middleware would have to allow it through.
- *Use a separate boolean column `human_only`* → rejected. Two sources of truth (`requiredRole` vs `humanOnly`); existing claim logic would grow an extra branch per row.

### Decision 2: Human-only tasks live in `to-do` status, claimable by humans only

`code-review` agents currently claim any `in-review` task. We are **not** extending that to `"human"` tasks: `human`-marked tasks stay in `to-do` until a human picks them up, then transition to `in-progress`. `code-review` agents still skip `human`-marked tasks.

The `isCodeReview` branch in `claim-task.ts` keeps its current behavior (only matches `in-review` tasks, ignores `requiredRole`). A `human` task can never be `in-review` unless a human explicitly moves it there; agents never do.

### Decision 3: Valibot validator accepts the union `AgentRole | "human" | null`

In `apps/api/src/schemas/`, the `requiredRole` validator becomes:

```ts
const requiredRoleSchema = v.nullable(
  v.union([v.picklist(AGENT_ROLES), v.literal("human")]),
);
```

API key `agentRole` keeps its existing `v.picklist(AGENT_ROLES)` — `"human"` is rejected at the key-creation layer with HTTP 400.

### Decision 4: UI uses a distinct badge and a "Human-only" entry in the create dialog selector

`task-role-badge.tsx` gets a new case for `requiredRole === "human"` rendering a neutral gray badge with the label "Human-only / 仅人工". The selector in `create-task-modal.tsx` adds an extra option above the seven agent roles so it's clearly separate (and so users don't mistake it for another agent role).

## Risks / Trade-offs

- [Risk] Existing data may already contain `required_role = "human"` accidentally, with no enforcement. → Mitigation: query the table once before deploy; if any rows exist, treat them as human-only (no migration needed; behavior is well-defined). Document in `Migration Plan`.
- [Risk] MCP `create_task` tool description might claim `human` is not a valid value. → Mitigation: update tool description and add a literal "human" example to the schema description.
- [Risk] UI mismatch between web badge and GitLab/Gitea/GitHub synced tasks. → Mitigation: integration mappings round-trip `requiredRole` already; downstream VCS integrations will display whatever label maps to the role string. Add a "Human-only" label mapping in the GitLab integration (and equivalents) so the badge shows in synced issues.
- [Trade-off] A human team member could claim a `human`-marked task and immediately re-assign it to an agent via the API key path. → Acceptable: this is a coordination convention, not a security boundary. We can add a server-side check later if it becomes a real problem.

## Migration Plan

No DDL. Rollout steps:

1. Land the permissions package change (`HUMAN_REQUIRED_ROLE` constant).
2. Land the Valibot schema update to accept `"human"` for `requiredRole`.
3. Land the claim-task / claim-next-task rejection branch.
4. Land API-key creation rejection of `agentRole = "human"`.
5. Land UI badge and selector option.
6. Land MCP tool description update.

Each step is independently deployable. No backfill: pre-existing `required_role` values are unaffected.

Rollback: revert the commit. Since no DDL was applied, the database stays consistent. Tasks already marked `human` would become claimable by agents again, which is a regression of intent but not a data integrity issue.

## Open Questions

- Should the GitLab / Gitea / GitHub integration map `human`-required tasks to a specific label (e.g., `kaneo-human-only`)? Owners should decide in a follow-up change; out of scope here.
- Should `claim-next-task` accept a `humanOnly: true` filter for human callers so they can specifically ask for human-only tasks in their queue? Likely yes, but defer to a follow-up.
- Do we want to audit-log when a human claims a `human` task (for analytics on agent vs. human workload split)? TBD.
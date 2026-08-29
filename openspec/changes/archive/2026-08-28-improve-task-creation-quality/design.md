## Context

Today, the `create_task` MCP tool is registered with a one-line description (`"Create a task in a project."`) and an input schema that accepts any string for `title` and `description`. The API route in `apps/api/src/task/index.ts` (POST `/api/task/:projectId`) accepts arbitrary titles/descriptions through `taskSchema` and the bulk-create path. The web create-task modal already has a `requiredRole` selector (added by the `add-human-required-role` change) but its copy does not guide the user.

Result observed in the field:

- Agents write terse code-style titles because nothing told them otherwise.
- Descriptions often reference an external design doc that the executing agent cannot fetch from its sandbox.
- Acceptance criteria are rarely included, so the reviewer has no objective done-condition.
- pi-agent sometimes omits `requiredRole`, leaving the task claimable by any role.

## Goals / Non-Goals

**Goals:**

- Force every task created via MCP (agent) and via the API (when authenticated with an API key) to declare `requiredRole`.
- Force every task description to contain an "Acceptance Criteria" section header so reviewers can sign off objectively.
- Set a reasonable title floor (8 chars, no leading slash, no pure branch-name patterns) so the board is readable.
- Provide a reusable MCP prompt `create_task_skill` that walks an agent through the same checklist.
- Update the web create-task modal copy so humans following the agent standard is natural.

**Non-Goals:**

- Changing how tasks are claimed, ordered, or assigned (covered by other changes).
- Enforcing AC validation on human-created tasks via cookie session — humans can ignore the rule; the modal will prompt but not block. (Block-level enforcement is only for agent paths.)
- Reformatting legacy tasks; this change applies only to task creation going forward.
- Localizing the new MCP prompt copy (kept in English; runs as a system prompt).

## Decisions

1. **Gate `requiredRole` on API-key auth, not on session-cookie auth.** The new check runs inside the POST handler after `workspaceAccess` resolves the caller: if the request has an `x-api-key` header (agent), `requiredRole` is mandatory. This keeps the human UX unchanged for the modal and CLI users.

2. **Title floor + sanity check.** Min length 8 chars. Reject titles that are entirely branch-like (`/^[a-z]+\/[A-Za-z0-9_-]+$/`), purely a ticket ID (`/^#?\d+$/`), or a SHA (`/^[0-9a-f]{7,}$/i`). The check is enforced for all callers — both agent and human — because unreadable titles hurt everyone.

3. **Description AC header.** Require the substring `Acceptance Criteria` (case-insensitive, allowing either an English header or a translated i18n key). Implemented as a Valibot check after the basic string min length. We do not parse Markdown; presence of the header is enough for now.

4. **MCP `create_task` description becomes a structured prompt.** A bullet-point list of what the agent must produce. Format chosen so most agent frameworks display it inline.

5. **New MCP prompt `create_task_skill`.** A reusable prompt template (MCP `prompts/list` + `prompts/get`) that returns the full checklist plus a worked example. Agents that support MCP prompts can invoke it before calling `create_task`. The prompt is plain text; no parameters.

6. **Web modal copy updates.** Placeholder text and helper text point users at the required structure; existing field layout is preserved.

## Risks / Trade-offs

- **Breaking change risk for existing agents.** External agents that omit `requiredRole` or the AC header will start receiving 400s. Mitigation: the MCP tool description is updated in the same release, so any agent that re-reads tool definitions on startup will pick up the new contract. Document this in the change's user-facing note.
- **False positives on the title check.** Branch names like `feat/auth` are useful for git but useless on a board. We accept the false-positive risk — a human can still rename the task after creation.
- **Description AC check is shallow.** We only check for the header text. Future iterations may parse list items. Out of scope here.
- **i18n drift.** The header check uses the literal English phrase. Localized headers (`验收标准`) will not pass the check. For now, the API also accepts `Acceptance Criteria` as well as `验收标准`. If we add more locales later, extend the allowlist in one place.
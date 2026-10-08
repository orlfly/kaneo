## Design

### Context

Task-executing agents authenticate with agent API keys (project-scoped via `metadata.projectId`) or MCP tokens. They work in a sandboxed project workdir (`<workdirRoot>/<projectId>/`) where `repo/` holds the cloned VCS repository and `uploads/` holds user files. Today the agents must compose many tool calls to understand their project, and have no persistent record of what was synced previously.

### Goals / Non-Goals

- Goals: one tool call to bootstrap or align workdir context; cheap warm-start detection; human-readable plus machine-readable context artifacts.
- Non-Goals: not changing claim-task semantics, not adding full task dumps to the bundle (agents still use list_tasks for detail), not syncing uploaded files.

### Approach

1. **Context bundle endpoint** `GET /api/agent/project-context?taskId=...`
   - Auth: agent-key middleware already used by `/api/task/claim-next`; resolves the key's bound project (or explicit `projectId` for unscoped keys, with team permission check).
   - Returns: `{ project: {id, name, slug, description, teamName}, statuses: string[], taskSummary: {total, byStatus, overdue}, vcs: {connected, type?, repository?}, task?: {…} }` (task included when `taskId` supplied and belongs to the project). Credentials excluded by construction: build the response from a whitelist, never pass the integration config through.

2. **Manifest artifacts in the workdir** (`apps/api/src/agent/context.ts`)
   - `kaneo-context.json`: `{ projectId, projectName, teamName, vcs: {type, repository} | null, syncedAt, headSha?, aligned: bool }`.
   - `KANEO_CONTEXT.md`: rendered summary (project basics, statuses, task summary, VCS state, how to refresh). Written/refreshed by the sync tool so any agent or human opening the workdir sees current state.
   - Read helper `readContextManifest(root)` returns `null` when absent or unparsable.

3. **`agent_sync_project` tool**
   - API side: registered in `chat/tools.ts` tool definitions and executed via the existing `/api/chat/project/:id/tool` gate; MCP side: `register.ts` calls the same endpoint (same pattern as the other agent_* tools).
   - Execution flow:
     - Ensure workdir, read existing manifest.
     - Load active VCS integration (existing loop over github/gitlab/gitea).
     - No clone present: run `agentCloneRepo`, write manifest (with head SHA read via isomorphic-git `log`), render `KANEO_CONTEXT.md`, return `{ mode: "cloned", … }`.
     - Clone present: compare manifest `headSha` against remote default branch head (cheap `git.getRemoteInfo`); if equal, refresh timestamp and return `{ mode: "aligned", changed: false }`; if different or manifest missing, fast-forward pull (`agentCloneRepo` already does this), update manifest and doc, return `{ mode: "aligned", changed: true }`.
     - No VCS integration: write context files with `vcs: null`, return `{ mode: "context-only" }`.
   - The tool response also embeds the context bundle (project basics, statuses, task summary) so a cold-start agent gets everything in one result.

### Trade-offs

- Manifest `headSha` comparison is best-effort: if the remote repo force-pushes within the same SHA window it may report aligned; acceptable because fast-forward pull is idempotent and cheap.
- `KANEO_CONTEXT.md` is a snapshot, not live state; the doc includes the bundle's `checkedAt` so staleness is visible. Agents needing live data still call list_tools endpoints.
- Reusing the chat tool endpoint from MCP keeps one sandboxing/authorization path instead of duplicating it (matches the existing agent_* tool pattern).

### Open Questions

- none

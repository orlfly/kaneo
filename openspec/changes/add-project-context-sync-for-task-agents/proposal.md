## Why

Task-executing agents (claim tasks via API key / MCP) start in a working directory that often has no Kaneo project context: they must hand-roll many calls (whoami → list_projects → get_task → list_tasks → clone repo) just to know what project they serve and get the code. This is slow, error-prone, and wastes tokens. Conversely, when a workdir already holds project info from a previous run, agents re-clone or re-fetch everything instead of aligning incrementally.

## What Changes

- Add a project-context sync capability so an executing agent can bootstrap or align its working directory with one tool call:
  - New `GET /api/agent/project-context` endpoint (agent-key auth, project-scoped) that returns a single bundle: project basics (name, description, slug, team name), the project's column statuses, a task summary (total, byStatus, overdue), the claimed task's details when provided, and the active VCS integration status (type, repository, no secrets).
  - New context manifest file `kaneo-context.json` written into the project workdir recording project id, project name, VCS type/repository, last-synced commit SHA, and last-synced timestamp, so any agent can detect what is already present.
  - New `agent_sync_project` tool (both pi-agent chat tools and MCP `registerTools`) that:
    - when no `repo/` clone exists: clones the connected repository and writes the manifest + a human-readable `KANEO_CONTEXT.md` summary;
    - when a clone already exists: fast-forwards only if the remote head differs, refreshes the manifest, and reports "already aligned" with what changed;
    - when the project has no VCS integration: still writes the Kaneo project context files and reports that code sync is unavailable.
- Response and manifest never include tokens, access tokens, installation IDs, or any credentials.

## Capabilities

### New Capabilities
- `agent-project-context-sync`: One-call project context bootstrap/alignment for task-executing agents: context bundle endpoint, workdir manifest files, and the `agent_sync_project` tool covering both cold start (no project info) and warm start (existing project info).

### Modified Capabilities
<!-- none: existing requirements unchanged; the new tool composes existing clone/file-write behavior -->

## Impact

- `apps/api`: new controller + route (`agent` area), manifest writing helper under `src/agent/`, tool registration in `src/chat/tools.ts` and `src/mcp/tools.ts`, OpenAPI JSON regeneration (`apps/docs/openapi.json`).
- `packages/mcp`: new tool registration mirroring the API-side tool.
- Existing endpoints unchanged; additive change, backward compatible.

# agent-project-context-sync Delta Spec

Adds one new capability for task-executing agents: bootstrap or align the working directory with Kaneo project context and the connected code repository in one step.

## ADDED Requirements

### Requirement: Project context bundle endpoint

The system SHALL expose `GET /api/agent/project-context` authenticated by an agent API key, scoped to the key's bound project (or an explicit `projectId` resolved through team authorization for unscoped keys). The response SHALL include the project's id, name, slug, description, and team name; the project's column status slugs; a task summary (total tasks, count by status, overdue count); and the active VCS integration state as `{ connected, type?, repository? }`. When a `taskId` query parameter is supplied and the task belongs to the project, the response SHALL include that task's details. The endpoint SHALL NOT include tokens, access tokens, installation IDs, or other credentials in the response.

#### Scenario: Cold-start agent fetches context

- **WHEN** an agent with a project-scoped API key calls the endpoint
- **THEN** it receives the project basics, statuses, task summary, and VCS state in one response with no credentials

#### Scenario: Optional task context

- **WHEN** the endpoint is called with a `taskId` belonging to the project
- **THEN** the response includes that task's details

#### Scenario: Unreachable integration state

- **WHEN** the project has no active VCS integration
- **THEN** `vcs.connected` is `false` and no `type` or `repository` is present

### Requirement: Workdir context manifest

The system SHALL maintain a `kaneo-context.json` manifest and a human-readable `KANEO_CONTEXT.md` in the project workdir, recording the project id, project name, team name, VCS type and repository (or null), last-synced timestamp, and last-synced repository head SHA when available. The system SHALL be able to read the manifest and treat a missing or unparsable manifest as "no prior project information".

#### Scenario: Manifest written on sync

- **WHEN** `agent_sync_project` completes
- **THEN** `kaneo-context.json` and `KANEO_CONTEXT.md` exist in the workdir and reflect the current project and repository state

#### Scenario: Missing manifest detected

- **WHEN** the workdir has no readable `kaneo-context.json`
- **THEN** the sync treats the workdir as cold and performs a full bootstrap

### Requirement: One-call workdir sync tool

The system SHALL provide an `agent_sync_project` tool (available to the pi-agent chat tools and to MCP clients) that, in a single call: ensures the project workdir exists; clones the project's connected repository when no clone is present, or fast-forwards the existing clone when the repository head has advanced; writes or refreshes the context manifest files; and returns the sync outcome (`cloned`, `aligned` with a `changed` flag, or `context-only` when no VCS integration exists) together with the project context bundle. The tool SHALL NOT return credentials.

#### Scenario: Cold start with connected repository

- **WHEN** the workdir holds no project information and the project has an active VCS integration
- **THEN** the tool clones the repository, writes the manifest and context document, and returns `mode: "cloned"` with the context bundle

#### Scenario: Warm start already aligned

- **WHEN** the workdir has a clone and manifest whose head SHA matches the remote repository head
- **THEN** the tool refreshes the sync timestamp and returns `mode: "aligned", changed: false` without re-cloning

#### Scenario: Warm start with new commits

- **WHEN** the workdir has a clone whose recorded head differs from the remote head
- **THEN** the tool fast-forwards the clone, updates the manifest and context document, and returns `mode: "aligned", changed: true`

#### Scenario: No repository connected

- **WHEN** the project has no active VCS integration
- **THEN** the tool still writes the context files and returns `mode: "context-only"` with the context bundle

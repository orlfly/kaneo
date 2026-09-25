## Context

The MCP agent (pi-agent) currently exposes a broad Kaneo tool catalog (`apps/api/src/mcp/tools.ts` for the modern server, mirrored in `packages/mcp/src/tools/register.ts` for the legacy server) covering teams, projects, tasks, comments, labels, relations, time entries, and search. It has no access to the project's integrated VCS systems.

Kaneo already has three VCS integrations, each with a stored config on the `integration` table scoped to a project:

- **GitHub** (`apps/api/src/plugins/github`): config holds `repositoryOwner`, `repositoryName`, `installationId`. Calls go through the GitHub App installation octokit (`getInstallationOctokit`). No user-supplied token; auth is the App installation.
- **GitLab** (`apps/api/src/plugins/gitlab`): config holds `baseUrl`, `accessToken`, `repositoryOwner`, `repositoryName`. Calls go through `createGitLabClient` / `gitlabFetch`, which enforce `assertPublicDestination` (SSRF guard) and a 10s timeout.
- **Gitea** (`apps/api/src/plugins/gitea`): config holds `baseUrl`, `accessToken`, `repositoryOwner`, `repositoryName`. Calls go through `createGiteaClient` / `giteaFetch`, which also enforce `assertPublicDestination`.

Each integration has import controllers (`import-issues.ts`, `import-gitlab-issues.ts`, `import-gitea-issues.ts`) that resolve the active integration for a project and import issues/PRs into Kaneo tasks. These are the natural building blocks to reuse.

The MCP tools run server-side in the API process with the signed-in user's bearer token, so they can query the database directly to resolve integrations and enforce team/project boundaries.

## Goals / Non-Goals

**Goals:**

- Give the MCP agent read and write access to the project's integrated GitHub, GitLab, and Gitea systems.
- Reuse the existing stored integration configs and existing client libraries; do not introduce a parallel VCS client layer.
- Scope all VCS access to the signed-in user's accessible projects and their active integrations. No new authorization surface.
- Reuse the existing SSRF guard for GitLab/Gitea outbound calls.
- Provide an issue-import tool that reuses the existing import controllers.

**Non-Goals:**

- No new VCS integrations beyond the existing GitHub/GitLab/Gitea.
- No new database schema or migration.
- No new dependencies.
- No changes to how integrations are configured or verified in the web UI.
- No file-system access beyond what the agent already has; this change is about VCS access only.

## Decisions

### 1. Register VCS tools on the shared MCP registrar

**选择**: Add the new tools to `apps/api/src/mcp/tools.ts` (modern server) and mirror them in `packages/mcp/src/tools/register.ts` (legacy server), following the existing pattern where both servers share the same tool names and behavior.

**理由**: The two servers already duplicate the tool catalog. Keeping both in sync preserves the existing contract for legacy MCP consumers while the modern server is the primary path. The shared `McpToolRegistrar` type keeps the registration contract identical.

### 2. Resolve the active integration per project inside the tool

**选择**: Each VCS tool takes a `projectId` (and for GitHub, the config's `installationId`), resolves the active `integration` row for that project and type, parses its config, and calls the appropriate client. This mirrors how the import controllers already work.

**理由**: The integration config is the single source of truth for how to reach the VCS. The agent should not be asked to supply tokens or base URLs; it should reference a project and let the server resolve the wiring. This keeps credentials out of the MCP tool inputs and out of the agent's context.

**Authorization**: Before resolving, the tool verifies the signed-in user can access the project (same team-membership check the API uses). This is the only authorization gate; it is the same boundary the web UI and REST API already enforce.

### 3. GitHub uses the App installation octokit; GitLab/Gitea use their clients

**选择**: For GitHub, call `getInstallationOctokit(config.installationId)` and use `octokit.rest.issues.*` / `octokit.rest.pulls.*`. For GitLab and Gitea, call `createGitLabClient(config)` / `createGiteaClient(config)` and use their issue/comment/label/pull methods.

**理由**: This reuses the exact auth and SSRF behavior already in production. GitHub has no user token to validate; GitLab/Gitea already enforce `assertPublicDestination` and timeouts inside `gitlabFetch`/`giteaFetch`.

### 4. Tool surface

**选择**: Add these tools, each taking `projectId` plus the operation-specific inputs:

Read:
- `vcs_list_repositories` — list repos the integration token can see (GitLab/Gitea `listUserRepos`; GitHub `octokit.rest.apps.listReposForAuthenticatedUser`).
- `vcs_list_issues` — list issues for the configured repo (state filter).
- `vcs_get_issue` — get one issue by number.
- `vcs_list_issue_comments` — list comments on an issue.
- `vcs_list_pull_requests` — list open PRs.
- `vcs_list_labels` — list repo labels.

Write:
- `vcs_create_issue` — create an issue.
- `vcs_update_issue` — update an issue (title/body/state).
- `vcs_create_issue_comment` — add a comment.
- `vcs_create_label` — create a label.
- `vcs_add_labels_to_issue` / `vcs_replace_issue_labels` / `vcs_remove_label_from_issue` — manage issue labels.

Import:
- `vcs_import_issues` — import issues from the project's integration into Kaneo tasks, reusing the existing import controllers.

**理由**: This covers the operations the existing clients already support, so no new VCS client code is needed. The tool names are namespaced with `vcs_` to avoid colliding with existing Kaneo tools and to make the VCS domain obvious to the agent.

### 5. Errors surface as MCP error results

**选择**: Wrap each tool body in the existing `run()` helper so failures become `isError: true` results with a readable message, consistent with every other MCP tool.

**理由**: Consistency with the existing catalog; the agent already knows how to interpret error results.

## Risks / Trade-offs

- **[Risk] GitHub App may not be installed for the configured repo** → **Mitigation**: `getInstallationOctokit` throws a clear error; the tool surfaces it as an MCP error result. The agent can report that the GitHub integration is not installed.
- **[Risk] GitLab/Gitea outbound calls to private/internal hosts are blocked by `assertPublicDestination`** → **Mitigation**: This is intentional SSRF protection and matches the existing integration behavior. Local dev can opt out with `KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS=true` (local only, not in production config).
- **[Risk] Duplicating the tool catalog across two servers drifts** → **Mitigation**: Both files are edited together in this change; a follow-up could extract a shared catalog, but that is out of scope (YAGNI).
- **[Risk] Agent could mutate VCS state the user did not intend** → **Mitigation**: Write tools are explicit and the agent only acts on the user's request. The same write surface already exists via the REST API for the same integrations; this does not widen the authorization boundary.
- **[Risk] Importing issues creates tasks and consumes task numbers** → **Mitigation**: Reuse the existing import controllers unchanged, which already handle dedup via external links and task-number claiming.

## Migration Plan

No database schema changes. This is additive server-side code: new MCP tools registered on both servers. Deploy by shipping the API; the tools become available immediately. Rollback is a git revert of the tool registration.

## Open Questions

- Should the VCS tools be gated behind a permission/role beyond team membership (e.g., only certain agent roles can write to VCS)? Current design keeps the same boundary as the REST API (team membership). A future change could add finer-grained VCS write permissions.
- Should `vcs_list_repositories` for GitHub use the App's accessible repos or only the configured repo? Current design lists the configured repo's context; listing all App-accessible repos is a possible extension.

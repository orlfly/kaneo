## Why

The MCP agent (pi-agent) can already read and operate files inside its working directory, but it cannot reach the project's integrated VCS systems (GitHub, GitLab, Gitea). When a task requires inspecting or updating issues, pull requests, or repository state, the agent is blind to the very systems the project is wired into. This forces users to copy data in and out manually and blocks the agent from acting on VCS-backed work.

## What Changes

- Add MCP tools that let the agent operate on the project's integrated VCS systems (GitHub, GitLab, Gitea) using the same stored integration configs the API already manages.
- Add read tools: list repositories, list issues, get an issue, list issue comments, list pull requests, list labels.
- Add write tools: create an issue, update an issue, create an issue comment, create a label, add/remove/replace labels on an issue.
- Add a tool to import issues from a connected VCS integration into a Kaneo project (reusing the existing import controllers).
- Resolve the active integration for a project by type (github | gitlab | gitea) and reuse its stored config (installation id for GitHub, base URL + access token for GitLab/Gitea).
- Keep all VCS access scoped to the signed-in user's team/project boundaries and to integrations the user can already reach through the API. No new authorization surface.
- Reuse the existing SSRF guard (`assertPublicDestination`) for GitLab/Gitea outbound calls; GitHub stays on the GitHub App installation octokit.

## Capabilities

### New Capabilities
- `mcp-vcs-access`: MCP tools that let the agent read and operate the project's integrated GitHub, GitLab, and Gitea systems (repositories, issues, comments, pull requests, labels, and issue import), scoped to the signed-in user's accessible projects and their active integrations.

### Modified Capabilities
<!-- No existing spec-level behavior changes. -->

## Impact

- `apps/api/src/mcp/tools.ts` — register the new VCS tools on the modern MCP server (and the legacy server via the shared registrar).
- `packages/mcp/src/tools/register.ts` — mirror the new tools for the legacy MCP server.
- `apps/api/src/plugins/github`, `apps/api/src/plugins/gitlab`, `apps/api/src/plugins/gitea` — reuse existing clients (`getInstallationOctokit`, `createGitLabClient`, `createGiteaClient`) and config schemas.
- `apps/api/src/github-integration/controllers/import-issues.ts`, `apps/api/src/gitlab-integration/controllers/import-gitlab-issues.ts`, `apps/api/src/gitea-integration/controllers/import-gitea-issues.ts` — reuse import logic.
- No database schema changes. No new dependencies.

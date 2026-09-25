## 1. Integration resolution helper

- [x] 1.1 Add a shared helper in `apps/api/src/mcp/` that resolves the active integration for a project by type (`github | gitlab | gitea`), parses its config, and verifies the signed-in user can access the project (team membership).
- [x] 1.2 Add a helper that returns the appropriate VCS client for a resolved integration: GitHub installation octokit, GitLab client, or Gitea client.

## 2. Read tools (modern server)

- [x] 2.1 Register `vcs_list_repositories` in `apps/api/src/mcp/tools.ts`.
- [x] 2.2 Register `vcs_list_issues` in `apps/api/src/mcp/tools.ts`.
- [x] 2.3 Register `vcs_get_issue` in `apps/api/src/mcp/tools.ts`.
- [x] 2.4 Register `vcs_list_issue_comments` in `apps/api/src/mcp/tools.ts`.
- [x] 2.5 Register `vcs_list_pull_requests` in `apps/api/src/mcp/tools.ts`.
- [x] 2.6 Register `vcs_list_labels` in `apps/api/src/mcp/tools.ts`.

## 3. Write tools (modern server)

- [x] 3.1 Register `vcs_create_issue` in `apps/api/src/mcp/tools.ts`.
- [x] 3.2 Register `vcs_update_issue` in `apps/api/src/mcp/tools.ts`.
- [x] 3.3 Register `vcs_create_issue_comment` in `apps/api/src/mcp/tools.ts`.
- [x] 3.4 Register `vcs_create_label` in `apps/api/src/mcp/tools.ts`.
- [x] 3.5 Register `vcs_add_labels_to_issue`, `vcs_replace_issue_labels`, and `vcs_remove_label_from_issue` in `apps/api/src/mcp/tools.ts`.

## 4. Import tool (modern server)

- [x] 4.1 Register `vcs_import_issues` in `apps/api/src/mcp/tools.ts`, reusing the existing GitHub/GitLab/Gitea import controllers.

## 5. Legacy server mirror

- [x] 5.1 Mirror all new VCS tools in `packages/mcp/src/tools/register.ts` for the legacy MCP server.

## 6. Verification

- [x] 6.1 Typecheck `apps/api` and `packages/mcp`.
- [x] 6.2 Add focused unit tests for the integration-resolution helper (authorization, missing/inactive integration).
- [x] 6.3 Add focused tests for at least one read tool and one write tool per VCS type (GitHub, GitLab, Gitea) using the existing client mocks.
- [x] 6.4 Verify the modern and legacy MCP servers both expose the new tools (tool listing).

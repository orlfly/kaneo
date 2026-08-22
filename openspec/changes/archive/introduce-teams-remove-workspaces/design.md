## Context

Kaneo today uses **workspace → project → board/columns → tasks**. The `workspace` is not standalone domain data; it is backed by better-auth's `organization` plugin mapped to custom tables (`organization` → `workspace`, `member` → `workspace_member`, `organizationRole` → `workspace_role`), with the active workspace stored in `session.activeOrganizationId` and driven in the web via `authClient.organization.*`. On top of that sit an editable role/permission matrix (`@kaneo/permissions`) and a billing/entitlement subsystem that only runs under `KANEO_CLOUD` (unused on self-hosted installs).

We are collapsing this to **team → project → board/columns → tasks** with a deliberately simpler shape. Workspace features that map to a team are replaced by team features; features with no team counterpart (billing, the role editor, unused fields) are **deleted**; and authentication/permissions are **rebuilt from scratch** as a lightweight team model instead of the plugin-backed matrix. This is a large change: 95 API files and 161 web files reference `workspace`.

## Goals / Non-Goals

**Goals:**
- Remove the `workspace` concept and the better-auth `organization` plugin mapping entirely.
- Promote `team` to the top-level unit with CRUD, and membership (add users, roles).
- Rebuild auth/permissions as a simplified team model: two fixed roles (`owner`, `member`) and one `requireTeamRole` middleware.
- Delete workspace features with no team counterpart: billing/entitlement, the custom role editor, unused fields.
- Make `project.teamId` required; project creation selects a pre-existing team, never creates one.
- Colocate team and user management in one area; both are pre-created.
- Redirect a user with no team from project creation to the user-management area.
- Preserve existing installs: workspaces migrate into teams, surviving dependents reassigned.

**Non-Goals:**
- No new board/kanban/project features beyond the ownership rename.
- No billing or per-team quotas (billing is deleted; self-hosted installs have none).
- No editable/custom team roles (fixed `owner`/`member` only).
- No team-agnostic "zero-team" state for normal users (a non-admin user always belongs to at least one team).

## Decisions

### D1. Table mapping (rename survivors, drop the rest)

| Current | Action |
|---|---|
| `workspace` | → `team` (keep `id`, `name`, `slug`, `archivedAt`; drop `logo`, `metadata`, `description`) |
| `workspace_member` | → `team_member` (`teamId`, `userId`, `role`, `joinedAt`) |
| `workspace_role` | **deleted** (fixed roles only) |
| `workspace_billing` | **deleted** |
| vestigial `team` / `team_member` | **deleted** |
| `project.workspaceId` | → `project.teamId` |
| `asset.workspaceId`, `invitation.workspaceId`, notification FKs | → `teamId` |

Rationale: renames are mechanical and keep semantics; anything not carried by a team (custom roles, billing) is dropped per the delete directive.

**Migration:** a Drizzle DDL migration plus a boot-time backfill (modeled on `migrate-workspace-user-email.ts`) that, when legacy `workspace` tables exist, copies each workspace into a `team` row, each member into `team_member`, and rewrites `project.workspaceId`, `asset.workspaceId`, `invitation.workspaceId`, and notification FKs to the new team ids. Runs once, idempotent. Custom `workspace_role` and `workspace_billing` rows are dropped (their features are gone).

### D2. Simplified team auth (drop the organization plugin)

Remove the better-auth `organization` plugin and its table mapping from `apps/api/src/auth.ts`. The team membership table (`team_member`) is the sole authorization source. The "active team" used by settings pages (which have no `$teamId` route param) is stored in a lightweight session field set by the team switcher, replacing `session.activeOrganizationId`.

### D3. Two fixed team roles and one middleware

Define exactly two team roles:
- `owner`: full management — create/update/delete the team, add/remove members, change roles, and all project/task operations.
- `member`: participation — create and update projects and tasks, use the board.

Replace `workspaceAccess` and `requireWorkspacePermission` with a single `requireTeamRole(level)` middleware in a `team-access-middleware.ts`. It resolves the team from a route param, query, body, project, or task, looks up the caller's `team_member.role`, and enforces the required level. Delete the `@kaneo/permissions` statement matrix and the workspace permission resource.

### D4. Team API module (CRUD + membership)

`apps/api/src/workspace/` becomes `apps/api/src/team/`:
- `POST /team` (create; caller becomes owner), `GET /team` (list caller's teams), `GET/PATCH/DELETE /team/:id`, `PUT /team/:id/archive`
- `GET/POST /team/:id/members`, `DELETE /team/:id/members/:userId`, `PATCH /team/:id/members/:userId` (role change between owner/member)
- Only `owner` manages members; the last owner cannot be demoted or removed.
- Mount in `apps/api/src/index.ts` with chained Hono builders, Valibot validators, OpenAPI metadata; add to `AppType`.

### D5. Project requires a pre-existing team

`project/index.ts` `POST /` requires a `teamId` (never creates a team), scoped by `teamAccess.fromBody()` + `requireTeamRole("member")`. All project read/update/archive/delete/reorder scope by `teamId`. Task-move stays within the same team.

**No-team redirect:** when a user opens project creation but has no team they can create projects in, the web shows a notice and redirects to the user-management area (Settings > System > Teams).

### D6. Web: team switcher, routes, and project creation

- Workspace store/switcher → team store/switcher; active team in a session field.
- Route tree `/dashboard/workspace/$workspaceId/...` → `/dashboard/team/$teamId/...`; regenerate `routeTree.gen.ts`.
- Create-project modal gains a team selector over the user's pre-created teams (default active team); no team → notice + redirect to user management.
- All fetchers/hooks/queries and realtime cache keys switch `workspaceId` → `teamId`.
- i18n: `workspace` keys → `team` keys in `en-US.json`, synced across locales.

### D7. Team and user management are one area

In `Settings > System` a single user-management page has `Users` and `Teams` sections. `Users` manages accounts (create/promote/disable/delete/reset password); `Teams` provides team CRUD plus member management (add existing users, assign owner/member, remove). Both are pre-created here before projects. `settings/workspace/*` (General/Roles/Labels/Billing) is replaced by this area; the roles page and billing are deleted.

### D8. Delete billing, role editor, and unused fields

Delete `apps/api/src/billing/` (routes, `requireEntitlement`, entitlement checks in project/task routes, billing reminders), the `settings/workspace/roles.tsx` editor and its hooks, and the `settings/workspace/billing.tsx` page. Drop `workspace_role`/`workspace_billing` tables and unused `workspace` fields.

### D9. Events / WebSockets / MCP

Event payloads and realtime cache keys switch `workspaceId` → `teamId`; `workspace.created` becomes `team.created`. MCP/API-key/integration context scopes switch to team. No billing events remain.

## Risks / Trade-offs

- **[Large blast radius (~250 files)] → Mitigation:** phase: (1) schema + backfill, (2) drop org plugin + active-team field, (3) permissions + `requireTeamRole`, (4) team + project API, (5) delete billing/role modules, (6) typed client + web data layer, (7) web routes/UI/switcher, (8) i18n/docs, (9) tests. Keep typecheck/build green per phase.
- **[Migration drops role/billing data] → Mitigation:** the migration only drops `workspace_role`/`workspace_billing` rows after confirming their features are gone; workspace → team and dependent reassignment are preserved and idempotent. Never run against production during development.
- **[Losing plugin-backed session state] → Mitigation:** the active-team session field is added in the same phase as removing `activeOrganizationId`; the switcher and settings `beforeLoad` migrate together.
- **[Public API/OpenAPI churn] → Mitigation:** update Valibot schemas and OpenAPI tags with each route; the typed client regenerates so the web picks up contract changes.

## Migration Plan

1. Schema + boot-time backfill (D1); verify a workspace becomes a team and dependents reassign on a copy of the dev DB.
2. Drop the organization plugin; add the active-team session field (D2).
3. Permissions + `requireTeamRole` (D3); typecheck + API unit/integration tests.
4. Team + project API (D4–D5).
5. Delete billing/role modules (D8).
6. Regenerate typed client; update web data layer.
7. Web routes/UI/switcher + no-team redirect (D6–D7).
8. i18n, docs, env, OpenAPI tags.
9. Full repo typecheck, lint, build, tests; e2e smoke test.

Rollback: migration keeps legacy workspace data until verified; a failed phase reverts the schema/migration pair (no user/team data dropped early).

## Open Questions

- Who may create a team in the user-management area? Default: any system admin.
- Should project slugs be unique per team or globally? Default: per-team uniqueness.
- The "no team" redirect applies when a user has no team at all. Should it also apply when the user has teams but lacks create-project permission in all of them? Default: yes.
- Active-team storage: session field vs user field. Decision per user direction: **session field**.

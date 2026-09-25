## Why

The `workspace` layer adds a redundant organizational boundary that complicates the product: it is backed by a heavyweight better-auth organization plugin, a full editable role/permission matrix, and a separate billing/entitlement subsystem that self-hosted installs never use. We want a flatter, simpler model where a **team** is the first-class organizational unit that owns projects directly. Workspace features that map cleanly to a team are replaced by team features; workspace features with no team counterpart are deleted; and authentication and permissions are rebuilt as a lightweight, team-based model instead of the plugin-backed one.

## What Changes

- **BREAKING**: Remove the `workspace` concept (table, membership, roles, billing, routes, navigation, permission resource, and the better-auth `organization` plugin mapping). Every surviving workspace-scoped notion is replaced by a team-scoped notion.
- **BREAKING**: Promote `team` to the top-level organizational unit. `workspace` → `team`, `workspace_member` → `team_member`, `project.workspaceId` → `project.teamId`; asset/invitation/notification workspaceId → teamId. The unused `team`/`team_member` tables are dropped.
- **BREAKING**: Rebuild authentication and permissions from scratch on the team model (simplified):
  - Drop the better-auth `organization` plugin and `authClient.organization.*` usage; "active team" is stored in a lightweight session field.
  - Replace the editable `viewer`/`member`/`admin`/`owner` permission matrix with **two fixed team roles**: `owner` (full management) and `member` (participation).
  - Replace `workspaceAccess` / `requireWorkspacePermission` with a single `requireTeamRole` middleware that resolves the team from route param/query/body/project/task.
- **BREAKING**: Delete workspace features with no team counterpart:
  - Billing/entitlement (`workspace_billing`, `requireEntitlement`, billing routes, billing reminders) — deleted (cloud-only, unused on self-hosted).
  - Custom role editor (`workspace_role` table, `settings/workspace/roles.tsx`, role CRUD API/hooks) — deleted.
  - Unused fields (logo/metadata/description) — cleaned up with the table rebuild.
- **New**: Team CRUD (create/list/read/update/delete/archive) with the creator as owner, managed in the user-management area.
- **New**: Team membership: add a user to a team, list members, remove members, change role. Teams and users are both **pre-created**; project creation never creates a team.
- **New**: Team management is colocated with user management (one `Settings > System` area with `Users` and `Teams` sections).
- **BREAKING**: Project creation requires a **pre-existing `teamId`** selected directly. If the user has no team, the system notifies them and redirects to the user-management area to add a team.
- **BREAKING**: Web navigation: workspace switcher and `/dashboard/workspace/$workspaceId/...` routes become a team switcher and `/dashboard/team/$teamId/...` routes.
- **Migration**: existing installs have workspaces migrated into teams (same data, new home), surviving dependents reassigned, and workspace roles/billing dropped.

## Capabilities

### New Capabilities

- `team-management`: Team as the top-level organizational unit. Team CRUD, ownership, archiving, and the team switcher. Teams are pre-created in the user-management area.
- `team-membership`: Adding users to a team, listing members, removing members, and assigning/revoking the fixed team roles.
- `team-permissions`: Simplified team-based auth — fixed `owner`/`member` roles and a single `requireTeamRole` middleware. No plugin, no editable role matrix.
- `project`: Project ownership by a team. Project CRUD where **creation requires a pre-existing `teamId` selected directly**, and all project queries scope by team membership. If the user has no team, the system notifies them and redirects to user management.
- `user-management`: Admin-driven global user management (create/promote/disable/delete/reset password) colocated with team CRUD and membership, so users and teams are both pre-created and managed in one place.

### Modified Capabilities

- (None; the existing `openspec/specs/` tree is empty. The capabilities above describe the post-change contract.)

## Impact

- **Database**: `workspace`, `workspace_member`, `workspace_role`, `workspace_billing` removed; `team`/`team_member` introduced; `project.workspaceId` → `teamId`; asset/invitation/notification FKs reassigned. Migration backfills workspaces into teams and reassigns surviving dependents.
- **Auth** (`apps/api/src/auth.ts`): remove the `organization` plugin and its table mapping; add a lightweight active-team session field.
- **Permissions** (`packages/permissions`): replace the role matrix with the two fixed team roles; the `workspace` statement is removed.
- **API** (`apps/api/src`): `workspace/` module becomes `team/` (CRUD + membership); `project/`, `column/`, `task/`, `label/`, `asset/`, `notification/`, `invitation/` retargeted workspace → team; `billing/` deleted; authorization middleware becomes `requireTeamRole`; admin module grows team CRUD + membership; OpenAPI/Valibot contracts updated.
- **Web** (`apps/web/src`): workspace store/switcher → team store/switcher; route tree `/dashboard/workspace/$workspaceId/...` → `/dashboard/team/$teamId/...`; `settings/workspace/*` becomes part of a single user-management area (`Users` + `Teams`); roles page and billing removed; project creation form requires a team selector with a no-team redirect; all fetchers/hooks/queries retargeted; i18n workspace keys replaced with team keys.
- **Events/WebSockets/MCP**: event payloads and realtime cache keys switch workspaceId → teamId; `workspace.created`-style events become team events.
- **Deployment/Docs**: env references, API docs, and OpenAPI tags updated.
- **Tests**: API unit + integration and web tests updated for the team model.

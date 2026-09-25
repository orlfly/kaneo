## ADDED Requirements

### Requirement: Two fixed team roles

The system SHALL define exactly two team roles: `owner` and `member`. `owner` SHALL have full management of the team (create/update/delete team, add/remove members, change roles, and all project/task operations). `member` SHALL participate (create and update projects and tasks, use the board). There SHALL be no editable or custom role matrix, and no `workspace` permission resource.

#### Scenario: Owner manages team

- **WHEN** a team owner acts on the team, its members, or its projects
- **THEN** the actions are authorized

#### Scenario: Member participates

- **WHEN** a team member creates or updates a task or project in a team project
- **THEN** the action is authorized

#### Scenario: No custom roles

- **WHEN** the set of roles is queried
- **THEN** it contains only `owner` and `member`

#### Scenario: No workspace resource

- **WHEN** the permission model is inspected
- **THEN** it references teams and never a workspace resource

### Requirement: Team membership is the authorization source

The system SHALL derive a user's authorization within a team solely from their `team_member` row and role. System admin status SHALL NOT grant implicit membership in a team. A user with no `team_member` row for a team SHALL be denied team-scoped actions.

#### Scenario: Non-member denied

- **WHEN** a user who is not a team member attempts a team-scoped action
- **THEN** the system denies the action

#### Scenario: Admin does not auto-join

- **WHEN** a system admin who is not a team member lists that team's projects
- **THEN** the system does not grant access based on admin status

### Requirement: Single requireTeamRole middleware

The system SHALL enforce team authorization in the API via a single `requireTeamRole` middleware that resolves the active team from a route parameter, query, body, project, or task, and checks the caller's `team_member` role against the required level. Hiding an action in the UI MUST NOT be treated as authorization.

#### Scenario: Resolve team from project route

- **WHEN** a request targets a project route for a team
- **THEN** the middleware resolves the team from the project and checks the caller's role

#### Scenario: Deny unauthorized action

- **WHEN** a caller without the required team role performs an action
- **THEN** the API returns an authorization error

### Requirement: Last owner protection

The system SHALL ensure a team always has at least one owner. The last owner MUST NOT be able to be demoted or removed.

#### Scenario: Cannot demote the last owner

- **WHEN** an owner attempts to demote or remove the team's only owner
- **THEN** the system rejects the request

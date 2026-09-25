## ADDED Requirements

### Requirement: Project belongs to a team

The system SHALL model a project as belonging to exactly one team. The system MUST NOT reference a workspace on a project.

#### Scenario: Project has a team

- **WHEN** a project is read
- **THEN** it exposes its owning `teamId` and never a workspace reference

### Requirement: Create a project requires a pre-existing team

The system SHALL require a `teamId` when creating a project, selecting from the user's pre-created teams. A project MUST NOT be created without an owning team, and creating a project MUST NOT create a team. The creating user SHALL have create-project permission in that team.

#### Scenario: Create project with team

- **WHEN** a user with create permission selects an existing team and submits a project
- **THEN** the project is created under that team with its default kanban columns

#### Scenario: Create project without team

- **WHEN** a user submits a project without a `teamId`
- **THEN** the system rejects the request with a validation error

#### Scenario: No team available redirects to user management

- **WHEN** a user who has no team they can create projects in attempts to create a project
- **THEN** the system shows a notice that a team is required and redirects to the user-management area to add a team

#### Scenario: Create project in team without permission

- **WHEN** a user without create-project permission in the team submits a project
- **THEN** the system returns an authorization error

### Requirement: List and read projects scoped by team membership

The system SHALL list and read projects only for teams the caller belongs to, and SHALL scope project operations to a single team.

#### Scenario: List team projects

- **WHEN** a team member lists projects for their team
- **THEN** the system returns only that team's non-archived projects (or archived when requested)

#### Scenario: Read project outside membership

- **WHEN** a caller reads a project of a team they do not belong to
- **THEN** the system returns an authorization error

### Requirement: Update, archive, and delete a project

The system SHALL allow members with update/delete permission to update, archive, unarchive, and delete a project within their team. Project operations SHALL remain scoped to the project's team.

#### Scenario: Archive a project

- **WHEN** a user with update permission archives a project
- **THEN** the project is marked archived and hidden from default listings

#### Scenario: Delete a project

- **WHEN** a user with delete permission deletes a project
- **THEN** the project, its columns, and its tasks are removed

#### Scenario: Modify project outside membership

- **WHEN** a caller updates a project of a team they do not belong to
- **THEN** the system returns an authorization error

### Requirement: Project board and tasks remain intact

The system SHALL preserve the existing board structure (columns, tasks grouped by status) and per-project task numbering within the team model. Moving a task between projects SHALL remain allowed only within the same team.

#### Scenario: Board renders per project

- **WHEN** a project's board is requested
- **THEN** the system returns the project's columns with tasks grouped by status

#### Scenario: Task move restricted to same team

- **WHEN** a user attempts to move a task to a project in a different team
- **THEN** the system rejects the request

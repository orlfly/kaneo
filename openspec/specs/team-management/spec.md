## ADDED Requirements

### Requirement: Team is the top-level organizational unit

The system SHALL model a **team** as the top-level organizational and authorization unit. A user's access to projects is determined by their membership in a team. A team has a name and an immutable id. The system MUST NOT use a workspace concept anywhere.

#### Scenario: Team exists as the top-level unit

- **WHEN** the system is queried for top-level organizational units
- **THEN** the system returns teams and no workspace records

#### Scenario: No workspace references remain

- **WHEN** any API response, event, route, or navigation path is inspected
- **THEN** it references `team` and never `workspace`

### Requirement: Create a team

The system SHALL allow an authenticated user to create a team by providing a name. The creating user SHALL become the team owner. The system SHALL generate a unique slug for the team.

#### Scenario: Create a team

- **WHEN** an authenticated user submits a new team name
- **THEN** the system creates a team with the given name, assigns the creator as owner, and returns the new team

#### Scenario: Team name required

- **WHEN** a user submits a create-team request without a name
- **THEN** the system rejects the request with a validation error

### Requirement: List and read teams

The system SHALL allow an authenticated user to list all teams they belong to, and to read the details of a team they are a member of. Users MUST NOT see teams they are not a member of.

#### Scenario: List member teams

- **WHEN** an authenticated user requests the team list
- **THEN** the system returns only teams where the user is a member

#### Scenario: Read a team you belong to

- **WHEN** a member requests a team's details
- **THEN** the system returns the team details

#### Scenario: Read a team you do not belong to

- **WHEN** a non-member requests a team's details
- **THEN** the system returns an authorization error

### Requirement: Update a team

The system SHALL allow a team owner to update the team's name and slug. Members MUST NOT be able to update the team.

#### Scenario: Owner updates a team

- **WHEN** the team owner changes the team name
- **THEN** the system persists the change and returns the updated team

#### Scenario: Member updates a team

- **WHEN** a team member attempts to update the team
- **THEN** the system returns an authorization error

### Requirement: Archive and delete a team

The system SHALL allow a team owner to archive a team (soft-delete via an archived-at timestamp) and to delete a team. Deleting a team SHALL cascade-delete its projects, columns, tasks, and membership rows.

#### Scenario: Archive a team

- **WHEN** the team owner archives the team
- **THEN** the team is marked archived and no longer appears in default team listings

#### Scenario: Delete a team cascades

- **WHEN** the team owner deletes a team that has projects
- **THEN** the team and all of its projects, columns, tasks, and members are removed

#### Scenario: Non-owner cannot delete

- **WHEN** a non-owner attempts to delete the team
- **THEN** the system returns an authorization error

### Requirement: Teams are pre-created in the user-management area

The system SHALL provide team creation and management within the same user-management area used for user accounts, so teams and users are both pre-created before projects exist. Team creation MUST NOT happen implicitly during project creation.

#### Scenario: Create a team from user management

- **WHEN** an admin opens the user-management area and creates a team
- **THEN** the team is created there alongside user account management

#### Scenario: No implicit team on project creation

- **WHEN** a user creates a project
- **THEN** the system does not create a team implicitly; it only selects an existing team

### Requirement: Redirect to user management when no team exists

The system SHALL, when a user attempts to create a project but has no team they can create projects in, notify the user and redirect them to the user-management area so they can add a team.

#### Scenario: Redirect when user has no team

- **WHEN** a user with no team attempts to create a project
- **THEN** the system shows a notice that a team is required and redirects to the user-management area

### Requirement: Team switcher

The system SHALL provide a team switcher so users can switch between the teams they belong to. Selecting a team scopes the project list and navigation to that team.

#### Scenario: Switch active team

- **WHEN** a user selects a different team in the switcher
- **THEN** the active team changes and the project list and routes update to that team's context

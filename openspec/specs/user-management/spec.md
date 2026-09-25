## ADDED Requirements

### Requirement: Global user management by admin

The system SHALL allow a system administrator to manage users globally: create a user account, promote/demote between system roles, enable/disable, delete, and reset a password. Built-in admins MUST NOT be demoted, disabled, or deleted.

#### Scenario: Create a user

- **WHEN** an admin creates a user with a username, name, and password
- **THEN** the account is created and the user can sign in

#### Scenario: Reset a password

- **WHEN** an admin resets a user's password
- **THEN** the user's password is updated and they can sign in with it

#### Scenario: Protect built-in admin

- **WHEN** an admin attempts to demote, disable, or delete the built-in admin
- **THEN** the system rejects the request

### Requirement: Associate a user with a team

The system SHALL allow an admin, when creating or editing a user, to associate the user with one or more teams and to set the user's role within each team. The system SHALL reuse the team-membership capabilities.

#### Scenario: Create user with team membership

- **WHEN** an admin creates a user and assigns them to a team with a role
- **THEN** the user is created and added to the team with that role

#### Scenario: Assign existing user to a team

- **WHEN** an admin assigns an existing user to a team with a role
- **THEN** the user becomes a member of that team

### Requirement: User and team management in one area

The system SHALL expose a single user-management area that manages both user accounts and teams. An admin SHALL be able to create teams, create users, add users to teams, assign roles, and manage members from this one place. Users and teams are both pre-created here before projects are made; project creation never creates them implicitly.

#### Scenario: Manage teams and users together

- **WHEN** an admin opens the user-management area
- **THEN** they can create a team, create a user, add the user to the team, and assign a role from the same area

#### Scenario: Project creation redirects here when no team

- **WHEN** a user without a team is redirected from project creation
- **THEN** they land in the user-management area so they can add a team

### Requirement: User access to teams is derived from membership

A user's ability to see and work inside a team, its projects, and its members SHALL be derived from their team membership and role, not from their system admin status. System admin status grants global user management, not implicit membership in every team.

#### Scenario: Admin does not auto-join teams

- **WHEN** a system admin (who is not a member of a given team) lists that team's projects
- **THEN** the system does not grant implicit access based on admin status

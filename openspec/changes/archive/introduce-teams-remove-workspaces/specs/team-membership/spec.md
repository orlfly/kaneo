## ADDED Requirements

### Requirement: Add a user to a team

The system SHALL allow a team owner to add a user to the team by selecting the user and a role (`owner` or `member`). The added user SHALL immediately gain access to the team's projects. The system MUST NOT allow a user to be added to a team more than once.

#### Scenario: Add a user to a team

- **WHEN** a team owner adds a user to the team with role "member"
- **THEN** the user becomes a member and can access the team's projects

#### Scenario: Duplicate membership rejected

- **WHEN** an owner attempts to add a user who is already a member of the team
- **THEN** the system rejects the request with a conflict error

#### Scenario: Non-owner cannot add members

- **WHEN** a team member attempts to add a user to the team
- **THEN** the system returns an authorization error

### Requirement: List team members

The system SHALL allow team members to list the members of a team they belong to, including each member's user identity, role, and joined time.

#### Scenario: List members

- **WHEN** a team member requests the member list
- **THEN** the system returns all members with their roles

#### Scenario: Non-member cannot list

- **WHEN** a user who is not a team member requests the member list
- **THEN** the system returns an authorization error

### Requirement: Remove a user from a team

The system SHALL allow a team owner to remove a member from the team. Removing a member MUST revoke their access to all of the team's projects. The system MUST NOT allow removing the last owner.

#### Scenario: Remove a member

- **WHEN** a team owner removes a member
- **THEN** the member loses access to the team's projects and is no longer listed

#### Scenario: Cannot remove the last owner

- **WHEN** an owner attempts to remove the team's only owner
- **THEN** the system rejects the request

### Requirement: Change a member's role

The system SHALL allow a team owner to change a member's role between `owner` and `member`. The system MUST NOT allow demoting or removing the last owner.

#### Scenario: Change a member role

- **WHEN** an owner changes a member from "member" to "owner"
- **THEN** the member's role is updated and their permissions reflect the new role

#### Scenario: Cannot demote the last owner

- **WHEN** an owner attempts to demote the team's only owner
- **THEN** the system rejects the request

### Requirement: Team members see projects scoped by membership

The system SHALL scope a user's project visibility to the teams they are a member of. Users MUST only see projects of teams they belong to.

#### Scenario: Member sees team projects

- **WHEN** a team member lists projects for their team
- **THEN** the system returns only projects belonging to that team

#### Scenario: Non-member cannot see team projects

- **WHEN** a non-member lists or reads projects for a team they do not belong to
- **THEN** the system returns an authorization error

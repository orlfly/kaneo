## MODIFIED Requirements

### Requirement: Role-matched task claiming

The system SHALL match claim candidates against three rules for the calling agent: tasks assigned to the agent, tasks whose required role matches the agent's role (or is generic), and tasks whose status is in the claimable status set. The claimable status set and role matching SHALL vary by agent role: a non-`code-review` agent claims `to-do` tasks with matching `requiredRole`; a `code-review` agent claims `in-review` tasks ignoring `requiredRole`.

#### Scenario: Claim a task assigned to the agent

- **WHEN** a task is assigned to the caller (assignee = caller user) and is in a claimable status
- **THEN** the calling agent may claim that task

#### Scenario: Claim a role-matched unassigned to-do task

- **WHEN** a non-`code-review` agent claims an unassigned `to-do` task with no required role or a required role equal to the caller's agent role
- **THEN** the calling agent may claim that task

#### Scenario: Claim refused when role does not match

- **WHEN** a non-`code-review` caller whose agent role does not match the task's required role attempts to claim a `to-do` task
- **THEN** the API refuses the claim with 403

#### Scenario: Code-review claims in-review tasks

- **WHEN** a `code-review` agent calls claim-next or claim
- **THEN** only `in-review` tasks are considered
- **AND** the task's `requiredRole` is ignored when matching
- **AND** the agent claims the best matching in-review task

#### Scenario: Status must be claimable

- **WHEN** a task's status is not in the claimable status set for the caller's agent role
- **THEN** the task is not claimable regardless of assignment or role

### Requirement: Task required role marker

The system SHALL allow a task to be marked with a required agent role via a nullable `required_role` column. A task with no required role is a generic task that any agent role may claim. When an agent changes a task's status to `in-progress`, `in-review`, or `done`, the system SHALL automatically set the task's `requiredRole` to the agent's role, `code-review`, or NULL respectively.

#### Scenario: Create a task with an optional required role

- **WHEN** a team member creates a task and optionally selects a required role
- **THEN** the task is stored with the selected `requiredRole`
- **AND** omitting the role stores `NULL` (generic task)

#### Scenario: Agent moves task to in-progress sets requiredRole

- **WHEN** an agent updates a task status to `in-progress`
- **THEN** the task's `requiredRole` is set to the agent's role

#### Scenario: Agent moves task to in-review sets requiredRole

- **WHEN** an agent updates a task status to `in-review`
- **THEN** the task's `requiredRole` is set to `code-review`

#### Scenario: Agent moves task to done clears requiredRole

- **WHEN** an agent updates a task status to `done`
- **THEN** the task's `requiredRole` is set to NULL

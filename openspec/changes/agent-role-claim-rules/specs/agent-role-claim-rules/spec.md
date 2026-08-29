## ADDED Requirements

### Requirement: Role-specific task claiming

The system SHALL apply role-specific claiming rules. A non-`code-review` agent SHALL only claim `to-do` tasks whose `requiredRole` is NULL or matches the agent's role. A `code-review` agent SHALL only claim `in-review` tasks, ignoring the task's `requiredRole`.

#### Scenario: Non-code-review claims matching to-do task

- **WHEN** a `coding` agent calls claim-next
- **THEN** it considers only `to-do` tasks where `requiredRole` is NULL or `coding`
- **AND** it claims the best matching task

#### Scenario: Non-code-review refuses role-mismatched to-do task

- **WHEN** a `coding` agent calls claim-next or claim on a `to-do` task whose `requiredRole` is `testing`
- **THEN** the task is not claimed
- **AND** the agent receives no matching task (claim-next) or a 403 (claim)

#### Scenario: Code-review claims in-review task ignoring requiredRole

- **WHEN** a `code-review` agent calls claim-next
- **THEN** it considers only `in-review` tasks
- **AND** it ignores each task's `requiredRole` when matching
- **AND** it claims the best matching in-review task

#### Scenario: Code-review does not claim to-do tasks

- **WHEN** a `code-review` agent calls claim-next
- **THEN** `to-do` tasks are not considered
- **AND** if no `in-review` task exists, the agent receives no matching task

### Requirement: requiredRole auto-flow on status change

The system SHALL automatically set a task's `requiredRole` when an agent changes the task status:
- to `in-progress`: `requiredRole` = the agent's role
- to `in-review`: `requiredRole` = `code-review`
- to `done`: `requiredRole` = NULL

For other statuses, `requiredRole` SHALL be left unchanged.

#### Scenario: Agent moves task to in-progress

- **WHEN** a `coding` agent updates a task status to `in-progress`
- **THEN** the task's `requiredRole` is set to `coding`

#### Scenario: Agent moves task to in-review

- **WHEN** an agent updates a task status to `in-review`
- **THEN** the task's `requiredRole` is set to `code-review`

#### Scenario: Agent moves task to done

- **WHEN** an agent updates a task status to `done`
- **THEN** the task's `requiredRole` is set to NULL

#### Scenario: Agent moves task to an unrelated status

- **WHEN** an agent updates a task status to a status other than `in-progress`, `in-review`, or `done`
- **THEN** the task's `requiredRole` is left unchanged

### Requirement: Agent-created task requiredRole

The system SHALL set a task's `requiredRole` to the creating agent's role when an agent creates a task without an explicit `requiredRole`.

#### Scenario: Agent creates task with own role

- **WHEN** a `devops` agent creates a task without specifying `requiredRole`
- **THEN** the created task's `requiredRole` is set to `devops`

#### Scenario: Agent creates task with explicit requiredRole

- **WHEN** an agent creates a task specifying an explicit `requiredRole`
- **THEN** the explicit `requiredRole` is used

#### Scenario: Non-agent creates task

- **WHEN** a user without an agent role creates a task
- **THEN** the task's `requiredRole` is set to the explicitly provided value or NULL

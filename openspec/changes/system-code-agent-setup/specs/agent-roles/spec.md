## MODIFIED Requirements

### Requirement: Task required role marker

The system SHALL allow a task to be marked with a required agent role via a nullable `required_role` column. A task with no required role is a generic task that any agent role may claim. Each required role now has a corresponding AGENTS.md definition file that can be installed to the project's agent working directory.

#### Scenario: Create a task with an optional required role

- **WHEN** a team member creates a task and optionally selects a required role
- **THEN** the task is stored with the selected `requiredRole`
- **AND** omitting the role stores `NULL` (generic task)

#### Scenario: Invalid required role rejected on create

- **WHEN** a create-task request includes a `requiredRole` not in the agent role vocabulary
- **THEN** the API rejects the request with a validation error

#### Scenario: Required role visible in task responses

- **WHEN** a task list or task detail response is returned
- **THEN** a `requiredRole` field is present (null for generic tasks)

#### Scenario: Role definition installable for each required role

- **WHEN** a task has a `requiredRole` set to one of the 7 valid roles
- **THEN** the corresponding AGENTS.md role definition can be installed to the project's agent working directory via the agent config install endpoint
## MODIFIED Requirements

### Requirement: Task required role marker

The system SHALL allow a task to be marked with a required agent role via a nullable `required_role` column. A task with no required role is a generic task that any agent role may claim. The `required_role` column additionally accepts the literal value `"human"`, which marks the task as reservable only by human team members. When the create-task request is authenticated via an API key, `requiredRole` is mandatory; when the request is authenticated via session cookie, omitting the role still stores `NULL` (generic task).

#### Scenario: Create a task with a required role

- **WHEN** a team member or agent creates a task and selects a required role
- **THEN** the task is stored with the selected `requiredRole`

#### Scenario: Create a task with an optional required role

- **WHEN** a team member creates a task and optionally selects a required role
- **THEN** the task is stored with the selected `requiredRole`
- **AND** omitting the role stores `NULL` (generic task)

#### Scenario: Agent must supply a required role

- **WHEN** a caller authenticated via an API key submits a create-task request without `requiredRole`
- **THEN** the API rejects the request with HTTP 400

#### Scenario: Human session may omit the role

- **WHEN** a caller authenticated via session cookie submits a create-task request without `requiredRole`
- **THEN** the task is stored with `NULL` (generic task)

#### Scenario: Invalid required role rejected on create

- **WHEN** a create-task request includes a `requiredRole` not in the agent role vocabulary and not equal to `"human"`
- **THEN** the API rejects the request with a validation error

#### Scenario: Required role visible in task responses

- **WHEN** a task list or task detail response is returned
- **THEN** a `requiredRole` field is present (null for generic tasks, the agent role name for role-restricted tasks, or `"human"` for human-only tasks)
## ADDED Requirements

### Requirement: Agent role vocabulary

The system SHALL define a shared, validated set of agent roles: `coding` (代码开发), `product-design` (产品设计), `architecture-design` (架构设计), `devops` (运维管理), `ui-design` (界面设计), `testing` (测试), and `code-review` (代码评审). The shared vocabulary SHALL be importable by the API, web, and MCP packages.

#### Scenario: Roles are enumerable

- **WHEN** any package imports the agent role vocabulary
- **THEN** it can enumerate exactly the seven roles above in a fixed order
- **AND** a `coding` default exists for agents that do not declare a role

#### Scenario: Invalid role rejected

- **WHEN** a value that is not one of the seven roles is checked against the vocabulary
- **THEN** the check returns false

### Requirement: Task required role marker

The system SHALL allow a task to be marked with a required agent role via a nullable `required_role` column. A task with no required role is a generic task that any agent role may claim.

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

### Requirement: Agent role identity via API key

The system SHALL let an API key declare its agent role through key metadata (`metadata.agentRole`). An API key without a declared role SHALL be treated as `coding`.

#### Scenario: API key declares a role

- **WHEN** an API key is created with `metadata.agentRole` set to a valid agent role
- **THEN** requests authenticated with that key carry the declared role as the caller's agent role

#### Scenario: Default role for undeclared keys

- **WHEN** an API key has no `agentRole` in its metadata
- **THEN** the caller's agent role defaults to `coding`

#### Scenario: Invalid metadata role ignored

- **WHEN** an API key's metadata contains an `agentRole` that is not in the vocabulary
- **THEN** the caller's agent role falls back to `coding`

#### Scenario: Role selectable at key creation

- **WHEN** a user creates an API key in the developer settings
- **THEN** a role selector is available (defaulting to `coding`)

### Requirement: Role-matched task claiming

The system SHALL match claim candidates against three rules for the calling agent: tasks assigned to the agent, tasks whose required role matches the agent's role (or is generic), and tasks whose status is in the claimable status set.

#### Scenario: Claim a task assigned to the agent

- **WHEN** a task is assigned to the caller (assignee = caller user) and is in a claimable status
- **THEN** the calling agent may claim that task

#### Scenario: Claim a role-matched unassigned task

- **WHEN** a task is unassigned, in a claimable status, and has no required role or a required role equal to the caller's agent role
- **THEN** the calling agent may claim that task

#### Scenario: Claim refused when role does not match

- **WHEN** a caller whose agent role does not match the task's required role attempts to claim the task
- **THEN** the API refuses the claim

#### Scenario: Status must be claimable

- **WHEN** a task's status is not in the claimable status set
- **THEN** the task is not claimable regardless of assignment or role

#### Scenario: Unassigned caller stays compatible

- **WHEN** a caller has the default `coding` role
- **THEN** generic tasks (no required role) and `coding` tasks remain claimable as before

### Requirement: Claim-next prioritization

The system SHALL offer `POST /api/task/claim-next` which claims the best candidate among the caller's rule-matched tasks. Tasks assigned to the caller SHALL be prioritized over role-matched unassigned tasks; within each group the existing ordering (due date ascending, priority descending, creation ascending) applies.

#### Scenario: Assigned task picked first

- **WHEN** the caller has an assigned claimable task and role-matched unassigned tasks
- **THEN** the assigned task is claimed first

#### Scenario: None available returns 404

- **WHEN** no matching candidate exists
- **THEN** the API returns 404 with a "no tasks available" message

#### Scenario: Explicit role narrows candidates

- **WHEN** the caller passes an explicit `requiredRole` filter
- **THEN** candidates are narrowed to generic tasks plus tasks of that role
- **AND** the filter cannot grant access to roles the caller does not have

### Requirement: Task listing by role

The system SHALL allow filtering the task list by `requiredRole` via a query parameter, so an agent can browse the tasks it is eligible for.

#### Scenario: Filter tasks by required role

- **WHEN** a task list request includes `requiredRole`
- **THEN** only tasks with that required role (plus generic tasks) are returned

#### Scenario: Unclaimed filter combines with role filter

- **WHEN** both `unclaimed=true` and a `requiredRole` filter are provided
- **THEN** the returned tasks satisfy both conditions

### Requirement: Task UI shows required role

The system SHALL show the required role on task cards and in task details as a badge when a task has one.

#### Scenario: Badge on task card

- **WHEN** a task with a required role is displayed on a board or list
- **THEN** a role badge is shown with the localized role name

#### Scenario: Role selector in create dialog

- **WHEN** a user opens the create-task dialog
- **THEN** an optional required-role selector is available with a generic default

### Requirement: MCP support for roles

The MCP tools SHALL expose the role model: `claim_next_task` documents the three matching rules, `create_task` accepts an optional `requiredRole`, and `list_unclaimed_tasks` accepts an optional `requiredRole` filter.

#### Scenario: claim_next_task documents roles

- **WHEN** a client reads the `claim_next_task` tool description
- **THEN** it describes assignment, role, and status matching

#### Scenario: create_task accepts a role

- **WHEN** a client calls `create_task` with a `requiredRole`
- **THEN** the created task carries that required role

#### Scenario: list_unclaimed_tasks filters by role

- **WHEN** a client calls `list_unclaimed_tasks` with a `requiredRole`
- **THEN** only matching unclaimed tasks are returned
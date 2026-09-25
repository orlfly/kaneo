## ADDED Requirements

### Requirement: Human-only required role marker

The system SHALL accept the literal value `"human"` as a `requiredRole` on a task. The value is a reservation marker meaning "no agent may claim this task; only a human team member can claim it." The marker SHALL NOT appear in `AGENT_ROLES` and SHALL NOT be assignable to `metadata.agentRole` on an API key.

#### Scenario: Create a human-only task

- **WHEN** a team member creates a task with `requiredRole = "human"`
- **THEN** the task is stored with `requiredRole = "human"`
- **AND** the API responds with 200 and the task body

#### Scenario: Human-only marker is not an agent role

- **WHEN** any package imports `AGENT_ROLES`
- **THEN** `"human"` is not present in the enumerated roles
- **AND** the `isAgentRole()` helper returns false for `"human"`

#### Scenario: API key creation rejects human agentRole

- **WHEN** a caller attempts to create an API key with `metadata.agentRole = "human"`
- **THEN** the API rejects the request with HTTP 400 and a validation error
- **AND** no key is persisted

### Requirement: Agents cannot claim human-only tasks

The system SHALL reject every agent role (including `coding`, `code-review`, and any future role) from claiming a task whose `requiredRole` is `"human"`.

#### Scenario: Coding agent refused a human-only task

- **WHEN** a coding agent calls `claim-task` for a task with `requiredRole = "human"`
- **THEN** the API responds with HTTP 403 and a message indicating the task is reserved for humans

#### Scenario: Code-review agent refused a human-only task

- **WHEN** a code-review agent calls `claim-task` for a task with `requiredRole = "human"`
- **THEN** the API responds with HTTP 403 even if the task status is `in-review`

#### Scenario: claim-next-task never returns human-only tasks to agents

- **WHEN** an agent calls `claim-next-task`
- **THEN** the returned candidate never has `requiredRole = "human"`

### Requirement: Humans can claim human-only tasks

The system SHALL allow a human caller (no API key, `agentRole === undefined`) to claim a task whose `requiredRole` is `"human"` OR `NULL`. Humans SHALL NOT be able to claim a task whose `requiredRole` is one of the agent roles (they have no agent role to match against).

#### Scenario: Human claims a human-only task

- **WHEN** a human caller (no API key) calls `claim-task` for a task with `requiredRole = "human"`
- **THEN** the task is assigned to that human and status moves to `in-progress`

#### Scenario: Human claims a generic task

- **WHEN** a human caller calls `claim-task` for a task with `requiredRole = NULL`
- **THEN** the task is assigned to that human and status moves to `in-progress`

#### Scenario: Human refused a role-restricted task

- **WHEN** a human caller calls `claim-task` for a task with `requiredRole` equal to one of the seven agent roles
- **THEN** the API responds with HTTP 403 (humans cannot claim role-restricted tasks)

### Requirement: UI distinguishes human-only tasks

The system SHALL render a distinct, localized badge for tasks whose `requiredRole` is `"human"`. The create-task dialog SHALL offer a "Human-only" entry in the required-role selector, presented separately from the seven agent roles.

#### Scenario: Human-only badge on task card

- **WHEN** a task with `requiredRole = "human"` is rendered on a board, list, or detail view
- **THEN** the localized "Human-only / 仅人工" badge is shown

#### Scenario: Human-only entry in create-task selector

- **WHEN** a user opens the create-task dialog and views the required-role selector
- **THEN** a "Human-only" option is present alongside the seven agent roles
- **AND** selecting it stores `requiredRole = "human"` on the created task
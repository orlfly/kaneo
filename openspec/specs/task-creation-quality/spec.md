# task-creation-quality Specification

## Purpose
TBD - created by archiving change improve-task-creation-quality. Update Purpose after archive.
## Requirements
### Requirement: Task title is human-readable

The system SHALL require every newly created task title to be human-readable. A title MUST be at least 8 characters long, MUST NOT match a pure branch-name pattern (e.g. `feat/auth`, `fix/bug-12`), a pure ticket id (e.g. `#123`, `456`), or a SHA-like hex string. Both human session callers and agent API-key callers are subject to this check.

#### Scenario: Branch-name title rejected

- **WHEN** a caller submits a title that matches a branch-name pattern
- **THEN** the API rejects the request with HTTP 400 and a message naming the rule

#### Scenario: SHA-only title rejected

- **WHEN** a caller submits a title consisting only of a hex string of length ≥ 7
- **THEN** the API rejects the request with HTTP 400

#### Scenario: Too-short title rejected

- **WHEN** a caller submits a title of fewer than 8 characters
- **THEN** the API rejects the request with HTTP 400

#### Scenario: Plain English title accepted

- **WHEN** a caller submits a title such as "Refactor OAuth refresh-token handling"
- **THEN** the API accepts the request and stores the title unchanged

### Requirement: Task description includes Acceptance Criteria

The system SHALL require an "Acceptance Criteria" section header in the description of every task created via an API key (agent caller). The header MAY appear in English (`Acceptance Criteria`) or in Chinese (`验收标准`). Case is ignored. The description's total length MUST be at least 40 characters. Human session-cookie callers are prompted but not blocked.

#### Scenario: Description without AC rejected

- **WHEN** an agent (authenticated with `x-api-key`) submits a description that does not contain `Acceptance Criteria` or `验收标准`
- **THEN** the API rejects the request with HTTP 400 and a message naming the rule

#### Scenario: Description with AC accepted

- **WHEN** an agent submits a description that contains `## Acceptance Criteria` (or the Chinese equivalent) followed by at least one bullet or sentence
- **THEN** the API accepts the request and stores the description

#### Scenario: AC header alone is not enough

- **WHEN** an agent submits a description shorter than 40 characters even if it mentions AC
- **THEN** the API rejects the request with HTTP 400

#### Scenario: Human session may omit AC

- **WHEN** a user authenticated via session cookie submits a create-task request with a description that lacks an AC section
- **THEN** the API accepts the request and stores the description (the modal prompts but does not block)

### Requirement: Agent-created tasks default requiredRole to the agent's role

When an agent (authenticated via an API key) creates a task without an explicit `requiredRole`, the system SHALL default it to the creating agent's own role so the work is routed to the right claimer. Human session-cookie callers MAY continue to omit `requiredRole` to support legacy flows, in which case the task stores `NULL` (generic task).

#### Scenario: Agent omits requiredRole

- **WHEN** an agent (authenticated with `x-api-key`) submits a create-task request without `requiredRole`
- **THEN** the API accepts the request and sets `requiredRole` to the agent's own role

#### Scenario: Agent with valid requiredRole accepted

- **WHEN** an agent submits a create-task request with `requiredRole = "human"` or any of the seven agent roles
- **THEN** the API accepts the request and stores the role

#### Scenario: Human session may omit requiredRole

- **WHEN** a user authenticated via session cookie submits a create-task request without `requiredRole`
- **THEN** the API accepts the request and stores `NULL` (generic task)

### Requirement: create_task_skill MCP prompt

The MCP server SHALL register a prompt named `create_task_skill` that returns a structured checklist an agent can follow before invoking `create_task`. The prompt returns the full checklist plus a worked example and is registered for both the legacy and modern MCP server shapes.

#### Scenario: create_task_skill listed

- **WHEN** a client calls `prompts/list`
- **THEN** `create_task_skill` appears in the response

#### Scenario: create_task_skill body

- **WHEN** a client calls `prompts/get` with name `create_task_skill`
- **THEN** the response contains the checklist items (title rules, description AC rule, requiredRole rule) and an example payload


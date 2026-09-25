# agent-key-project-scope Specification

## Purpose

Defines the optional project binding for agent API keys (`metadata.projectId`): how users bind a key to one project in developer settings, how the API enforces that scope on every task operation, how `claim-next` restricts candidates to the bound project, and how the scope is surfaced in key management and the MCP `claim_next_task` tool description.

## Requirements

### Requirement: Agent API key project binding

The system SHALL allow an API key to declare an optional project binding through key metadata (`metadata.projectId`). A key with a project binding SHALL only be permitted to operate on tasks in that project. A key without a project binding SHALL retain the current behavior (all projects of the user's teams).

#### Scenario: Key created with project binding

- **WHEN** a user creates or edits an API key in developer settings and selects a project
- **THEN** the key's metadata stores that `projectId`
- **AND** requests authenticated with the key are scoped to that project

#### Scenario: Key without binding keeps existing behavior

- **WHEN** an API key has no `metadata.projectId`
- **THEN** task operations span all projects of the teams the user belongs to, as before

#### Scenario: Project selector shows only accessible projects

- **WHEN** a user opens the project selector while creating or editing an API key
- **THEN** only projects of teams the user belongs to are offered

### Requirement: Project-scoped request enforcement

The system SHALL enforce the project binding on every API-key-authenticated task operation. Attempting to read, create, update, claim, or transition tasks outside the bound project SHALL be rejected with HTTP 403.

#### Scenario: Task read outside bound project rejected

- **WHEN** a project-bound key requests a task that belongs to another project
- **THEN** the API rejects the request with 403

#### Scenario: Task mutation outside bound project rejected

- **WHEN** a project-bound key attempts to create, update, or claim a task in another project
- **THEN** the API rejects the request with 403

#### Scenario: Operation inside bound project allowed

- **WHEN** a project-bound key operates on a task in the bound project
- **THEN** the request proceeds subject to the existing role and permission checks

### Requirement: Bound project must remain available

The system SHALL reject requests authenticated with a key whose bound project no longer exists or has been archived, with HTTP 403 and an error that identifies the missing project binding.

#### Scenario: Bound project deleted

- **WHEN** the project bound to a key is deleted
- **THEN** subsequent requests with that key fail with 403 and a message identifying the missing binding

#### Scenario: Bound project archived

- **WHEN** the project bound to a key is archived
- **THEN** task operations with that key fail with 403 until the binding is changed or the project is restored

### Requirement: Claim-next honors project binding

The system SHALL restrict `claim-next` candidate search to the bound project when the caller's API key is project-bound. Role matching, assignment priority, and status rules within that project SHALL be unchanged.

#### Scenario: Claim-next searches only bound project

- **WHEN** a project-bound agent calls claim-next
- **THEN** candidates come only from the bound project
- **AND** no task from another team or project of the same user can be claimed

#### Scenario: Binding does not weaken role matching

- **WHEN** a project-bound agent calls claim-next
- **THEN** the existing agent-role matching and priority ordering apply within the bound project

### Requirement: Scoping surfaced in settings and agent onboarding

The system SHALL surface the project binding when creating or editing an API key, and SHALL document the project scope in the MCP tool description for `claim_next_task` so an agent session understands it serves a single project.

#### Scenario: Binding shown on key management

- **WHEN** the developer settings list API keys
- **THEN** each key shows its bound project (or "all projects" when unbound)

#### Scenario: claim_next_task documents project scope

- **WHEN** a client reads the `claim_next_task` tool description
- **THEN** it states that a project-bound key only claims tasks in the bound project


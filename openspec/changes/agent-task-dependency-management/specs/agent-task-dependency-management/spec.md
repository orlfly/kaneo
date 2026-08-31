# agent-task-dependency-management Specification

## Purpose

Give pi-agent and role agents the ability to manage task dependency relations (subtask / blocks / related) when creating and working with tasks, so agent-created tasks reflect real dependencies in the existing task-relation model and Gantt view.

## ADDED Requirements

### Requirement: Agent can create a task relation

The system SHALL expose a `create_task_relation` tool to the chat agent (pi-agent) that creates a relation between two tasks in the current project, using the existing task-relation controller. The relation type SHALL be one of `subtask` (source is the parent, target the child), `blocks` (source blocks target), or `related` (bidirectional).

#### Scenario: Create a subtask relation

- **WHEN** pi-agent calls `create_task_relation` with a source task, a target task, and `relationType: "subtask"`
- **THEN** the relation is created via the existing task-relation controller
- **AND** the response includes the created relation

#### Scenario: Create a blocks relation

- **WHEN** pi-agent calls `create_task_relation` with `relationType: "blocks"`
- **THEN** the relation is created with source blocking target

#### Scenario: Create a related relation

- **WHEN** pi-agent calls `create_task_relation` with `relationType: "related"`
- **THEN** the relation is created as bidirectional

#### Scenario: Relation creation is scoped to the project

- **WHEN** pi-agent calls `create_task_relation` for tasks outside the current project
- **THEN** the relation is refused

### Requirement: Agent can query task relations

The system SHALL expose a `get_task_relations` tool to the chat agent that returns all relations (subtask / blocks / related) involving a task in the current project, including the associated source and target task data.

#### Scenario: Query relations for a task

- **WHEN** pi-agent calls `get_task_relations` with a task id
- **THEN** the response lists all relations involving that task with their source and target task data

### Requirement: Agent can delete a task relation

The system SHALL expose a `delete_task_relation` tool to the chat agent that deletes a relation by its relation id.

#### Scenario: Delete a relation

- **WHEN** pi-agent calls `delete_task_relation` with a relation id
- **THEN** the relation is deleted

### Requirement: create_task accepts optional dependencies

The system SHALL allow `create_task` (both the chat tool and the MCP tool) to accept an optional `dependencies` array. Each entry SHALL specify a `targetTaskId` and a `relationType` (`subtask` / `blocks` / `related`). After the task is created, the system SHALL create a relation from the new task (source) to each declared target. If any relation cannot be created, the system SHALL delete the relations already created for this task and return an error, leaving no partial dependencies.

#### Scenario: Create a task with a dependency

- **WHEN** an agent calls `create_task` with a `dependencies` entry pointing to an existing task
- **THEN** the task is created
- **AND** a relation is created from the new task to the declared target

#### Scenario: Create a task with multiple dependencies

- **WHEN** an agent calls `create_task` with multiple `dependencies` entries
- **THEN** the task is created
- **AND** a relation is created for each declared target

#### Scenario: Invalid dependency rolls back relations

- **WHEN** an agent calls `create_task` with a `dependencies` entry whose target task does not exist or is outside the project
- **THEN** the task creation fails
- **AND** any relations already created for this task are deleted
- **AND** the agent receives an error

### Requirement: Agent guidance declares dependencies

The system SHALL instruct pi-agent (via the system prompt) and role agents (via role templates and the claim-task skill) to declare task dependencies when creating tasks that depend on existing tasks, using the `subtask` / `blocks` / `related` relation types.

#### Scenario: System prompt guides dependency declaration

- **WHEN** pi-agent is asked to create a task that depends on an existing task
- **THEN** the system prompt instructs it to use `create_task_relation` to declare the dependency

#### Scenario: Role agent guidance declares dependencies

- **WHEN** a role agent creates a follow-up task that depends on an existing task
- **THEN** the role template and claim-task skill instruct it to declare the dependency

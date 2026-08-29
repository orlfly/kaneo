## ADDED Requirements

### Requirement: pi-agent task status update tool

The system SHALL provide pi-agent with an `update_task_status` tool that updates a task's status to a valid project status value. This enables pi-agent to complete tasks (set status to `done`) and close/archive tasks (set status to `archived`).

#### Scenario: Update task status

- **WHEN** the user asks pi-agent to complete or close a task
- **THEN** pi-agent calls `update_task_status` with the task ID and the target status
- **AND** the task status is updated to the requested value
- **AND** a `task.status_changed` event is published

#### Scenario: Complete a task

- **WHEN** the user asks pi-agent to mark a task as done
- **THEN** pi-agent calls `update_task_status` with status `done`
- **AND** the task status is set to `done`

#### Scenario: Close/archive a task

- **WHEN** the user asks pi-agent to close a task
- **THEN** pi-agent calls `update_task_status` with status `archived`
- **AND** the task status is set to `archived`

#### Scenario: Invalid status rejected

- **WHEN** pi-agent calls `update_task_status` with a status not valid for the project
- **THEN** the tool returns an error indicating the status is invalid
- **AND** the task status is unchanged

#### Scenario: Task not found

- **WHEN** pi-agent calls `update_task_status` with a non-existent task ID
- **THEN** the tool returns an error indicating the task was not found

### Requirement: Tool execution uses caller identity

The `update_task_status` tool SHALL execute with the calling user's identity so that permission checks and event attribution work correctly. The tool SHALL only update tasks the calling user (team member) is authorized to update.

#### Scenario: Event attributes to the caller

- **WHEN** pi-agent updates a task status
- **THEN** the `task.status_changed` event's `userId` is the calling team member

#### Scenario: Tool follows team authorization

- **WHEN** the calling user is a member of the project's team
- **THEN** the tool can update tasks in that project
- **AND** tasks outside the user's team scope remain inaccessible
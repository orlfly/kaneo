# Delta: project-chat — create_task tool goes through the controller

## ADDED Requirements

### Requirement: pi-agent write tools delegate to public-API controllers

The pi-agent chat tools that mutate persistent state (`create_task` and any future write tool) MUST NOT call Drizzle directly. They MUST delegate to the same controller function the corresponding public HTTP route calls, so that validation, authorization, project-counter increment, and event publication flow through one code path.

#### Scenario: `create_task` delegates to the `createTask` controller

- **WHEN** the pi-agent invokes `create_task` with `title`, `description`, `priority`, `status`, and optional `requiredRole`
- **THEN** the chat tool calls `createTask` from `apps/api/src/task/controllers/create-task.ts` with the caller's `userId`
- **AND** the controller's `claimTaskNumber` is the only place that increments the project's `lastTaskNumber`
- **AND** the controller publishes a `task.created` event so realtime subscribers (Board, Backlog, activity feed) see the new row

#### Scenario: `create_task` does not write to the database directly

- **WHEN** the chat `create_task` tool runs
- **THEN** the chat module never calls `db.insert(taskTable)`, `db.update(taskTable)`, or `db.delete(taskTable)` for the task entity
- **AND** any future chat tool that mutates a project entity follows the same controller-delegation pattern

#### Scenario: controller errors surface as a tool result

- **WHEN** the `createTask` controller throws (e.g., invalid status, assignee not found, validation failure)
- **THEN** the chat tool catches the error
- **AND** returns `{ error: <message> }` as the tool result so pi-agent can adjust and retry

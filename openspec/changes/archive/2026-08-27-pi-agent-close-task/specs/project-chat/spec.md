## MODIFIED Requirements

### Requirement: Send message to pi-agent via SSE streaming

The system SHALL provide an SSE endpoint `POST /api/chat/project/:projectId` that streams pi-agent responses token-by-token. The endpoint SHALL be protected by team membership: only members of the project's team may call it. The system prompt SHALL be updated to reflect that pi-agent can now update task status via the `update_task_status` tool, while still being unable to delete tasks.

#### Scenario: User sends a message and receives streamed response

- **WHEN** a team member posts a message to the chat endpoint
- **THEN** the API stores the user message in the `chat_message` table with `role = "user"`
- **AND** the API sends the conversation history to the pi-agent service
- **AND** the response is streamed back via SSE `token` events followed by a `done` event
- **AND** the complete assistant response is stored in the `chat_message` table with `role = "assistant"`

#### Scenario: pi-agent uses tools to query project data

- **WHEN** the pi-agent returns a function call (e.g., `list_tasks`)
- **THEN** the API server executes the function internally using the caller's team permissions
- **AND** the result is sent back to the pi-agent to continue the conversation
- **AND** the final text response is streamed to the user

#### Scenario: pi-agent creates a task via tool call

- **WHEN** the pi-agent calls `create_task` with a title
- **THEN** the API server creates the task in the database
- **AND** the task is visible in the project's Board and Backlog views
- **AND** the pi-agent confirms the creation in its response

#### Scenario: pi-agent updates task status

- **WHEN** the user asks pi-agent to complete or close a task
- **THEN** pi-agent calls the `update_task_status` tool
- **AND** the system prompt instructs pi-agent that it can update task status via the tool
- **AND** the tool executes with the caller's identity
- **AND** the task status is updated and the pi-agent confirms in its response

#### Scenario: Unconfigured service returns 503

- **WHEN** the pi-agent is not configured (AI settings disabled, base URL missing, or API key missing)
- **AND** a team member posts a message
- **THEN** the API returns `503` with an error body

#### Scenario: Non-team member denied access

- **WHEN** a user who is not a member of the project's team calls the chat endpoint
- **THEN** the API returns `403 Forbidden`

## MODIFIED Requirements

### Requirement: Send message to pi-agent via SSE streaming

The system SHALL provide an SSE endpoint `POST /api/chat/project/:projectId` that streams pi-agent responses token-by-token and emits `progress` events for each tool call (see `chat-progress-stream`). The endpoint SHALL be protected by team membership: only members of the project's team may call it. The system prompt SHALL be updated to reflect that pi-agent can now update task status via the `update_task_status` tool, while still being unable to delete tasks.

#### Scenario: User sends a message and receives streamed response

- **WHEN** a team member posts a message to the chat endpoint
- **THEN** the API stores the user message in the `chat_message` table with `role = "user"`
- **AND** the API sends the conversation history to the pi-agent service
- **AND** the response is streamed back via SSE `progress` events for each tool call, `token` events for the final text, and a `done` event
- **AND** the complete assistant response is stored in the `chat_message` table with `role = "assistant"`

#### Scenario: pi-agent uses tools to query project data

- **WHEN** the pi-agent returns a function call (e.g., `list_tasks`)
- **THEN** the API server writes a `progress` event describing the tool before executing it
- **AND** the API server executes the function internally using the caller's team permissions
- **AND** the result is sent back to the pi-agent to continue the conversation
- **AND** the final text response is streamed to the user via `token` events

#### Scenario: pi-agent creates a task via tool call

- **WHEN** the pi-agent calls `create_task` with a title
- **THEN** the API server emits a `progress` event for `create_task` before executing the call
- **AND** the API server creates the task in the database
- **AND** the task is visible in the project's Board and Backlog views
- **AND** the pi-agent confirms the creation in its response

#### Scenario: pi-agent updates task status

- **WHEN** the user asks pi-agent to complete or close a task
- **THEN** pi-agent calls the `update_task_status` tool
- **AND** the API server emits a `progress` event for `update_task_status`
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

### Requirement: Chat UI with markdown rendering

The system SHALL render pi-agent responses as markdown and provide a text input with send button. The chat panel SHALL also render `progress` events from the active turn as a compact progress log above the streaming bubble (see `chat-progress-stream`).

#### Scenario: Markdown in pi-agent response rendered

- **WHEN** the pi-agent response contains markdown formatting (headers, lists, code blocks)
- **THEN** the chat UI renders it as formatted markdown

#### Scenario: User sends message with Enter key

- **WHEN** the user presses Enter in the input field
- **THEN** the message is sent
- **AND** Shift+Enter inserts a newline

#### Scenario: Streaming indicator while waiting for response

- **WHEN** the pi-agent is generating a response
- **THEN** the UI shows a typing/streaming indicator
- **AND** the input is disabled until the response completes
- **AND** the UI shows one progress line per `progress` event, scoped to the active turn
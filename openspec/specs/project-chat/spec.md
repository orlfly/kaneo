## Purpose

Defines the project-level AI assistant (pi-agent) chat interface: the chat tab, SSE message streaming, tool-driven task/project interaction, conversation history, and admin configuration.
## Requirements
### Requirement: Chat tab in project navigation

The system SHALL add a "Chat" tab to the project page navigation.

#### Scenario: Chat tab visible to team members

- **WHEN** a user who is a member of the team opens a project page
- **THEN** the project navigation shows a "Chat" tab

#### Scenario: Chat tab navigates to chat view

- **WHEN** the user clicks the "Chat" tab
- **THEN** the URL changes to `/dashboard/team/$teamId/project/$projectId/chat`
- **AND** the chat interface is displayed

#### Scenario: Chat tab shows disabled state when pi-agent not configured

- **WHEN** the pi-agent service is not configured (AI settings disabled, or base URL/API key missing)
- **AND** the user opens the Chat tab
- **THEN** the page shows a notice that the AI assistant is not enabled

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

### Requirement: Load conversation history

The system SHALL provide a `GET /api/chat/project/:projectId` endpoint that returns the conversation history for a project.

#### Scenario: User opens chat tab and sees previous messages

- **WHEN** a team member requests the conversation history for a project
- **THEN** the API returns all previous messages for that project
- **AND** messages are ordered by `createdAt` ascending

#### Scenario: Empty conversation for new project

- **WHEN** the user opens the Chat tab for a project with no previous messages
- **THEN** the API returns an empty array

### Requirement: Clear conversation history

The system SHALL provide a `DELETE /api/chat/project/:projectId` endpoint that removes the conversation history for a project. Only members of the project's team may clear it.

#### Scenario: User clears the conversation

- **WHEN** a team member sends a clear request for a project
- **THEN** all `chat_message` rows for that project are deleted
- **AND** the API returns `{ "cleared": true }`

### Requirement: Chat message persistence

The system SHALL store all chat messages in a `chat_message` database table scoped by `projectId`.

#### Scenario: User message stored before sending to pi-agent

- **WHEN** a user sends a message
- **THEN** a row is inserted into `chat_message` with `role = "user"`, `content = <message>`, `projectId = <project>`

#### Scenario: Assistant response stored after streaming completes

- **WHEN** the pi-agent finishes streaming its response
- **THEN** a row is inserted into `chat_message` with `role = "assistant"`, `content = <full response>`, `projectId = <project>`

### Requirement: pi-agent system prompt with project context

The system SHALL inject a system prompt that establishes pi-agent as a project management assistant with awareness of the project's tasks and status.

#### Scenario: System prompt includes project information

- **WHEN** a conversation is initiated
- **THEN** the system prompt sent to pi-agent includes the project name, team name, and a description of the pi-agent's role as a project manager assistant
- **AND** the prompt instructs pi-agent to use the provided tools (list_tasks, get_task, create_task, get_project_summary, list_blocked_tasks) to answer with real data

### Requirement: AI assistant configuration (admin only)

The system SHALL store the pi-agent configuration (enabled flag, base URL, encrypted API key, and model) in a singleton `chat_config` row, and expose it through admin-only endpoints. The API key MUST be encrypted at rest and MUST NOT be returned in plaintext by any response.

#### Scenario: Admin reads the configuration

- **WHEN** an instance admin requests `GET /api/chat/config`
- **THEN** the API returns the enabled flag, base URL, model, and a masked API key placeholder
- **AND** the stored secret is never included in the response

#### Scenario: Admin updates the configuration

- **WHEN** an instance admin submits `PUT /api/chat/config`
- **THEN** the API stores the enabled flag, base URL, model, and an encrypted API key
- **AND** the response masks the API key

#### Scenario: Masked key keeps the stored secret

- **WHEN** the admin submits the masked placeholder as the API key
- **THEN** the previously stored encrypted key is preserved

#### Scenario: Empty key clears the stored secret

- **WHEN** the admin submits an empty API key
- **THEN** the stored encrypted key is removed

#### Scenario: Non-admin denied

- **WHEN** a user who is not an instance admin calls the config endpoints
- **THEN** the API returns `403 Forbidden`

### Requirement: Pi-agent status endpoint

The system SHALL expose `GET /api/chat/status` without authentication so the client can check whether the assistant is enabled. The response MUST NOT be cached.

#### Scenario: Status reflects the current configuration

- **WHEN** any client requests the chat status
- **THEN** the API returns `{ "enabled": <boolean> }` reflecting the current configuration
- **AND** the response carries `Cache-Control: no-store`

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


## ADDED Requirements

### Requirement: Chat tab in project navigation

The system SHALL add a "Chat" tab to the project page navigation, after the existing Board, Backlog, and Gantt tabs.

#### Scenario: Chat tab visible to team members

- **WHEN** a user who is a member of the team opens a project page
- **THEN** the project navigation shows a "Chat" tab after "Gantt"

#### Scenario: Chat tab navigates to chat view

- **WHEN** the user clicks the "Chat" tab
- **THEN** the URL changes to `/dashboard/team/$teamId/project/$projectId/chat`
- **AND** the chat interface is displayed

#### Scenario: Chat tab shows disabled state when pi-agent not configured

- **WHEN** the pi-agent service is not configured (AI settings disabled, or base URL/API key missing)
- **AND** the user opens the Chat tab
- **THEN** the page shows a notice that the AI assistant is not enabled

### Requirement: Send message to pi-agent via SSE streaming

The system SHALL provide an SSE endpoint `POST /api/project/:projectId/chat` that streams pi-agent responses token-by-token.

#### Scenario: User sends a message and receives streamed response

- **WHEN** the user types a message and sends it
- **THEN** the API stores the user message in `chat_message` table with `role = "user"`
- **AND** the API sends the conversation history to the pi-agent service
- **AND** the response is streamed back via SSE events
- **AND** the complete assistant response is stored in `chat_message` table with `role = "assistant"`

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

#### Scenario: Non-team member denied access

- **WHEN** a user who is not a member of the project's team calls the chat endpoint
- **THEN** the API returns 403 Forbidden

### Requirement: Load conversation history

The system SHALL provide a `GET /api/project/:projectId/chat` endpoint that returns the conversation history for a project.

#### Scenario: User opens chat tab and sees previous messages

- **WHEN** the user opens the Chat tab
- **THEN** the API returns all previous messages for that project
- **AND** messages are ordered by `createdAt` ascending

#### Scenario: Empty conversation for new project

- **WHEN** the user opens the Chat tab for a project with no previous messages
- **THEN** the API returns an empty array
- **AND** the UI shows a welcome prompt

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

### Requirement: Chat UI with markdown rendering

The system SHALL render pi-agent responses as markdown and provide a text input with send button.

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
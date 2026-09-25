# chat-progress-stream Specification

## Purpose
TBD - created by archiving change pi-agent-stream-with-progress. Update Purpose after archive.
## Requirements
### Requirement: SSE progress events surface agent tool calls

The system SHALL emit an SSE event named `progress` from `POST /api/chat/project/:projectId` for every tool call the pi-agent makes before its final text response. Each `progress` event MUST carry a JSON payload with the keys `round` (1-based integer), `tool` (the tool name as returned by pi-agent), and `label` (a short localized human-readable string). The `token` and `done` events MUST continue to fire as before.

#### Scenario: Progress event emitted for each tool call in a round

- **WHEN** pi-agent returns one or more tool calls in a turn
- **THEN** for each tool call the API writes a `progress` event before executing the tool
- **AND** the event payload includes `round`, `tool`, and `label` matching the tool name

#### Scenario: Multiple rounds emit increasing round numbers

- **WHEN** pi-agent requires more than one tool-call round to produce the final answer
- **THEN** the `round` value increments by one for each round
- **AND** every tool call in a round shares the same `round` number

#### Scenario: Unknown tool falls back to generic label

- **WHEN** the tool name is not present in the server-side label map
- **THEN** the API still emits the `progress` event
- **AND** the `label` is a generic localized string indicating the agent is working

#### Scenario: Tool argument values are not exposed

- **WHEN** the API emits a `progress` event
- **THEN** the payload MUST NOT include tool argument values, tool results, or any other tool input/output detail

### Requirement: Progress events stream alongside token events

The `progress` event MUST be written to the same SSE response as the existing `token` and `done` events. The API MUST open the SSE stream at the start of the turn (after persisting the user message) so that `progress` events are observable before the first `token` event. The API MUST end the stream with a `done` event exactly as before.

#### Scenario: Progress events precede text tokens

- **WHEN** a user sends a message that requires at least one tool call before the final answer
- **THEN** the SSE stream receives one or more `progress` events
- **AND** these events arrive before any `token` event

#### Scenario: Pure text turn emits no progress events

- **WHEN** pi-agent produces a final answer with no tool calls
- **THEN** the SSE stream receives only `token` events followed by `done`
- **AND** no `progress` event is emitted

#### Scenario: Stream still ends with done

- **WHEN** the turn completes, succeeds, or fails
- **THEN** the SSE stream ends with a single `done` event
- **AND** the stream is closed cleanly

### Requirement: Chat panel renders agent progress

The chat panel MUST display each `progress` event as a compact, single-line item in the active assistant turn. While the turn is in progress the item MUST show a spinner and the localized `label`. When the turn ends the item MUST collapse into a completed state (for example a check mark) without occupying additional vertical space. The progress log MUST NOT be persisted to `chat_message` and MUST NOT appear after a page reload.

#### Scenario: Progress item appears as soon as the event arrives

- **WHEN** the SSE stream emits a `progress` event for tool `list_tasks` with label "正在查询任务列表"
- **THEN** the chat panel shows a new line containing a spinner and the text "正在查询任务列表"

#### Scenario: Progress log collapses on done

- **WHEN** the SSE stream emits the `done` event for the active turn
- **THEN** each progress line collapses to a completed indicator (for example ✓ + label)
- **AND** subsequent turns start with a fresh empty progress log

#### Scenario: Unknown label renders as-is

- **WHEN** a `progress` event carries a label the client has not localized
- **THEN** the chat panel renders the label text verbatim with the spinner or completed indicator

#### Scenario: Progress log clears between turns

- **WHEN** the user submits a new message after a previous turn completes
- **THEN** the progress log from the previous turn is no longer visible
- **AND** the new turn starts with an empty progress log


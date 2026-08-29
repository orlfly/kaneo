## Why

The pi-agent chat currently streams the final assistant text token-by-token, but every tool round runs silently. From the user's perspective the agent looks frozen for several seconds while it calls `list_tasks`, `create_task`, or `update_task_status`, and then the answer appears all at once. This makes long agent turns feel unreliable and hides the work being done.

## What Changes

- **Stream a short progress line for each agent round** before the text tokens start, so the user sees what the agent is doing in near real time.
- **Emit one progress event per tool call** identifying the tool name and a short, generic summary (e.g., "查询任务列表", "创建任务", "更新任务状态"). No tool arguments or results are surfaced.
- **Keep the existing token-by-token text stream and `done` event** unchanged. Progress events arrive in the same SSE stream as a new `progress` event before the `token` events of that round.
- **Update the chat panel to render progress lines** as a compact, single-line, muted "正在 …" indicator that collapses into a completed tick when the round ends. Progress is transient and is not persisted to `chat_message`.
- **No new persisted fields**. The `chat_message` schema, the chat history API, and the OpenAPI shape for the SSE stream stay the same apart from the new event type.

## Capabilities

### New Capabilities
- `chat-progress-stream`: Define the SSE `progress` event and the on-screen display of agent working steps during a pi-agent turn.

### Modified Capabilities
- `project-chat`: The `POST /api/chat/project/:projectId` SSE stream MUST emit `progress` events in addition to `token` and `done`. The chat panel MUST render and update progress lines for the active round.

## Impact

- API: `apps/api/src/chat/controllers/send-message.ts` (tool-round loop) and `apps/api/src/chat/pi-agent-client.ts` (no streaming change). New event type only.
- Web: `apps/web/src/components/project/chat-panel.tsx` and `apps/web/src/fetchers/project/chat.ts` (SSE parser + UI).
- Schema: `chat_message` table is unchanged; progress is ephemeral.
- OpenAPI: extend the documented SSE event list for `POST /api/chat/project/:projectId`.
- Tool surface: unchanged. Tool argument values and tool results are never sent over SSE; only the tool name is.
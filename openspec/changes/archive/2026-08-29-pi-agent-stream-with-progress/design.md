## Context

`POST /api/chat/project/:projectId` in `apps/api/src/chat/controllers/send-message.ts` runs a tool-call loop (`MAX_TOOL_ROUNDS = 15`) and only opens the SSE stream after the loop exits, when it has a final assistant message to stream. Tool calls themselves happen silently because the client cannot observe anything until `streamSSE` starts emitting `token` events.

The web client (`apps/web/src/components/project/chat-panel.tsx` + `apps/web/src/fetchers/project/chat.ts`) consumes the SSE stream and renders the assistant text, but has no concept of "agent is busy doing something." During a long tool-call round the user sees the input box still disabled and no feedback, which feels like a hang.

The agent currently has a stable set of tools (`apps/api/src/chat/tools.ts`): `list_tasks`, `get_project_summary`, `list_blocked_tasks`, `list_merge_requests`, `create_task`, `agent_clone_repo`, `agent_list_files`, `agent_search_files`, `agent_read_file`, `agent_run_command`. Each tool has a stable name we can map to a user-facing summary.

## Goals / Non-Goals

**Goals:**
- Give the user a real-time, low-noise signal that the agent is working between the time they hit Send and the first text token arrives.
- Reuse the existing SSE connection; do not introduce a parallel channel.
- Keep `chat_message` persistence and history APIs unchanged.
- Keep tool argument values and tool results on the server. Only the tool name is exposed.

**Non-Goals:**
- Live streaming of tool arguments or tool results to the client.
- Persisting progress events to the database.
- Per-project or per-tool opt-out of progress reporting.
- Changing the existing `token` or `done` events or their payloads.
- Replacing the chunked fallback `token` emission with `chatCompletionStream` (separate concern).

## Decisions

### 1. Emit a new SSE event `progress` between tool rounds

While the tool-call loop runs we keep `currentMessages` locally and have no open SSE stream yet. Decision: open the SSE stream as soon as the user message has been persisted, then write `progress` events from the loop and `token`/`done` events once the final answer is ready. The handler now wraps the whole turn in a single `streamSSE`.

**Why over buffering `progress` until the stream opens:** the loop can run up to 15 rounds, each round doing I/O. Holding the first progress event back until the end would defeat the purpose. The handler already returns the SSE response synchronously; converting the early JSON returns to streamed `progress` events keeps the wire format uniform.

**Wire format:**
```
event: progress
data: {"round": 1, "tool": "list_tasks", "label": "正在查询任务列表"}

event: progress
data: {"round": 1, "tool": "create_task", "label": "正在创建任务"}

event: token
data: ...

event: done
data: {"messageId": "..."}
```

`label` is the localized short string (Chinese for the existing locale). Tool names not in the map get a generic label ("正在处理").

### 2. Server-side tool-name → label map

A small lookup table (`apps/api/src/chat/progress-labels.ts`) maps each known tool name to a localized label. New tools are added by editing that table; unknown tools fall back to a generic label. This keeps the labels close to the tool registry and avoids leaking tool descriptions to the client.

### 3. Client-side progress state

Extend `streamChatMessage` in `apps/web/src/fetchers/project/chat.ts` to handle the `progress` event by appending to a `progressLog: ProgressEntry[]` it returns alongside the streamed text. The chat panel renders this log as a compact list above the streaming bubble, scoped to the active round only.

When the assistant bubble ends (or the round ends), each entry collapses from "正在 X" + spinner into "✓ X" using a small CSS transition. Once the `done` event arrives, the log is hidden; on the next turn it is cleared.

Progress entries are not part of `ChatMessage` and are not persisted. Reloading the page or switching projects discards them.

### 4. Errors and edge cases

- A tool that throws is still executed and its error is captured as a tool result. We do not emit a separate progress event for the failure; the round's progress line stands and the next round (or final text) replaces it.
- If the loop exits via the JSON error path (`pi-agent request failed`, `pi-agent returned no response`), we now write a single SSE `error` event and a `done` event instead of returning a JSON 502. The chat panel already handles `error` events.
- Aborts from the client propagate via `AbortSignal`; we close the SSE stream cleanly.

### 5. Single source of truth for event types

The chat-panel fetcher and the panel component share a typed `ChatStreamEvent` union (already implicit in the parser) that now includes `progress`. The OpenAPI description for `POST /api/chat/project/:projectId` is updated to document `progress` alongside `token`, `done`, `error`.

## Risks / Trade-offs

- [Earlier perceived hang on long tool rounds is hidden, not removed] → Mitigation: progress only describes what the agent is doing; if a round genuinely hangs the user still sees the last "正在 X" line, which is the same situation as today but with explicit context.
- [Server-side work moves into the SSE handler] → Mitigation: the early `return c.json(...)` calls are replaced by `await stream.writeSSE({ event: "error", ... })` and `await stream.writeSSE({ event: "done", ... })` followed by `return`. The handler signature and tests must be updated to reflect that errors now flow through the stream.
- [Adding a new tool name without updating the label map gives the generic label] → Mitigation: the fallback label is acceptable; the table is short enough that adding a tool is a single-line change.
- [Progress labels leak that tools exist] → Mitigation: labels describe the user-visible effect (e.g., "创建任务"), not tool internals. No argument values are exposed.

## Migration Plan

- No DB migration. No env-var changes.
- Deploy API and web together; the client falls back to ignoring unknown events if the server is ahead.
- Rollback: revert the API change; the client simply stops rendering progress lines (events are ignored).

## Open Questions

- Should the progress line animate while the next round is starting (e.g., a 250 ms delay before showing the next "正在 X") so the UI does not flicker between adjacent rounds? Leaning toward no for v1, but easy to add later.
- Do we want a single "正在思考…" placeholder between rounds instead of one line per tool call? Current proposal: one line per tool call, replaced in place.
## 1. Server-side progress labels

- [x] 1.1 Add `apps/api/src/chat/progress-labels.ts` exporting `progressLabelFor(toolName: string): string` with one entry per tool in `apps/api/src/chat/tools.ts` and a generic fallback.
- [x] 1.2 Add a small unit test asserting the map covers every tool name returned by `toolDefinitions` and that unknown names return the fallback.

## 2. Server-side SSE `progress` emission

- [x] 2.1 Refactor `apps/api/src/chat/controllers/send-message.ts` so the whole turn runs inside a single `streamSSE`. Open the stream right after persisting the user message so progress events are observable before any token.
- [x] 2.2 Emit progress events before each tool call (`event: "progress"`, data: `{ round, tool, label }`) before executing each tool call. Use `progressLabelFor(tool.name)`.
- [x] 2.3 Replace early 502 returns with SSE error+done with `stream.writeSSE({ event: "error", ... })` followed by a final `done` event so error states still reach the chat panel through the SSE stream.
- [x] 2.4 Update `apps/api/src/chat/index.ts` OpenAPI description for `POST /api/chat/project/:projectId` to document the new `progress` event alongside `token`, `done`, `error`.
- [x] 2.5 Add an integration test (`tests/api-integration`) that stubs the pi-agent call to return a `list_tasks` tool call and asserts the captured SSE response contains a `progress` event with `tool: "list_tasks"` before the `token` events.

## 3. Client-side progress parsing

- [x] 3.1 Extend `streamChatMessage` in `apps/web/src/fetchers/project/chat.ts` to recognize the `progress` event, expose a `progressLog: ProgressEntry[]` in its return value, and yield it through the same async iterator / callback API the panel uses today.
- [x] 3.2 Update the panel state in `apps/web/src/components/project/chat-panel.tsx` to track `progressLog` alongside the streaming message and reset it at the start of each turn and after `done`.

## 4. Chat panel UI

- [x] 4.1 Add a compact progress component (`apps/web/src/components/project/chat-progress-list.tsx`) that renders `progressLog` as a list of single-line items with a spinner while streaming and a completed indicator after `done`.
- [x] 4.2 Mount the progress component above the streaming assistant bubble in `chat-panel.tsx`. Keep the existing markdown bubble below.
- [x] 4.3 Add a Vitest component test in `apps/web/src/components/project/chat-panel.test.tsx` (or a new test file) that feeds a fake SSE stream with two `progress` events then a `token`/`done`, and asserts the progress list appears and collapses.

## 5. i18n and accessibility

- [x] 5.1 Add the new server-emitted Chinese label strings to `i18n/en-US.json` (or the locale the API uses) so the server does not regress to the generic fallback. Only needed if a new label is introduced server-side.
- [x] 5.2 Add any client-side strings introduced by the progress component to `apps/web/public/locales/en-US/translation.json` and `apps/web/public/locales/zh-CN/translation.json`, then run `pnpm --filter @kaneo/web i18n:check`.
- [x] 5.3 Make sure each progress item exposes a localized `aria-label` (e.g., "Agent is querying tasks") so screen readers announce the working step.

## 6. Verification

- [x] 6.1 Run `pnpm --filter @kaneo/api typecheck` and `pnpm --filter @kaneo/web typecheck`.
- [x] 6.2 Run `pnpm --filter @kaneo/api test` and `pnpm --filter @kaneo/web test` and ensure the new tests pass.
- [x] 6.3 Run `pnpm i18n:check` at the repo root.
- [x] 6.4 Manual smoke: in a real browser, send a chat message that triggers a tool call (e.g., "列出任务") and confirm the progress line appears, animates while waiting, and collapses once the assistant text starts streaming.
- [ ] 6.5 Archive the change with `openspec archive pi-agent-stream-with-progress` once verified.
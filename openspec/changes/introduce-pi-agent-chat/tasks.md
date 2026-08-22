## 1. Database schema and migration

- [x] 1.1 Add `chatMessageTable` to `apps/api/src/database/schema.ts` with columns: `id` (text, PK, cuid), `projectId` (text, FK to project, cascade delete), `role` (text: "user" | "assistant"), `content` (text, notNull), `createdAt` (timestamp, defaultNow). Add indexes on `projectId` and `createdAt`.
- [x] 1.2 Add `chatMessageTableRelations` to `apps/api/src/database/relations.ts` (project relation).
- [x] 1.3 Export `chatMessageTable` and `chatMessageTableRelations` from `apps/api/src/database/index.ts` schema object.
- [x] 1.4 Generate the Drizzle migration with `pnpm --filter @kaneo/api db:generate` and inspect the SQL. (`0045_add_chat_message.sql` creates `chat_message`; `0046_add_chat_tables.sql` creates `chat_config`. Both use `IF NOT EXISTS` for idempotency and were verified against a fresh database via `drizzle-kit migrate`.)

## 2. API chat module

- [x] 2.1 Create `apps/api/src/chat/` module with `index.ts` defining Hono routes:
  - `GET /project/:projectId/chat` — list conversation history (requires `teamAccess.fromProject()`, `requireTeamRole("member")`)
  - `POST /project/:projectId/chat` — send message and stream SSE response (same auth)
- [x] 2.2 Create `apps/api/src/chat/controllers/list-messages.ts` — query `chatMessageTable` by `projectId`, ordered by `createdAt` asc.
- [x] 2.3 Create `apps/api/src/chat/controllers/send-message.ts` — stores user message, builds conversation context, calls pi-agent API, streams response via SSE, stores assistant response.
- [x] 2.4 Create `apps/api/src/chat/tools.ts` — define OpenAI function-calling tools: `list_tasks`, `get_task`, `create_task`, `get_project_summary`. Each tool executes against the database using the caller's `userId` and project scope.
- [x] 2.5 Create `apps/api/src/chat/pi-agent-client.ts` — minimal HTTP client for pi-agent's OpenAI-compatible API (`POST /v1/chat/completions` with `stream: true`). Reads `PI_AGENT_API_KEY` and `PI_AGENT_BASE_URL` from env.
- [x] 2.6 Build the system prompt in `send-message.ts` that includes project name, team name, and pi-agent role description.
- [x] 2.7 Handle tool-call loop: if pi-agent returns `tool_calls`, execute tools, append results, re-call pi-agent, repeat until a text response is produced.
- [x] 2.8 Return 503 with `{ error: "pi-agent not configured" }` when env vars are missing.

## 3. Mount chat routes

- [x] 3.1 Import and mount chat routes in `apps/api/src/index.ts`: `api.route("/chat", chat)` or inline under project routes.
- [x] 3.2 Add `typeof chatApi` to `AppType` union in `apps/api/src/index.ts`.

## 4. Web chat route and components

- [x] 4.1 Create `apps/web/src/routes/_layout/_authenticated/dashboard/team/$teamId/project/$projectId/chat.tsx` route component.
- [x] 4.2 Create `apps/web/src/components/project/chat-panel.tsx` — chat UI with message list, input box, send button, streaming indicator.
- [x] 4.3 Create `apps/web/src/fetchers/project/chat.ts` — `listChatMessages(projectId)` and `streamChatMessage(projectId, content)` using `fetch` with SSE parsing.
- [x] 4.4 Create `apps/web/src/hooks/queries/project/use-chat-messages.ts` — TanStack Query hook for listing messages.
- [x] 4.5 Render markdown in assistant messages using the existing markdown renderer component.
- [x] 4.6 Show "AI assistant not enabled" notice when API returns 503.

## 5. Project layout integration

- [x] 5.1 Update `apps/web/src/components/common/project-layout.tsx`: extend `activeView` type to `"backlog" | "board" | "gantt" | "chat"`. Add Chat button in the view switcher. Add `handleNavigateToChat` navigation handler. Update `resolvedView` to detect `/chat` in pathname. Update `handleProjectSwitch` to route to chat when `resolvedView === "chat"`.
- [x] 5.2 Update `apps/web/src/components/common/header/mobile-project-nav.tsx`: extend `activeView` type, add Chat nav item.

## 6. i18n

- [x] 6.1 Add `chat` namespace to `i18n/en-US.json` with keys: `pageTitle`, `placeholder`, `send`, `streaming`, `welcomeTitle`, `welcomeDescription`, `notEnabledTitle`, `notEnabledDescription`, `errorFailed`, `errorTimeout`, `you`.
- [x] 6.2 Add zh-CN translations for all `chat` keys.
- [x] 6.3 Run `i18n:check:fix` to sync all locales.

## 7. Verification

- [x] 7.1 Typecheck `@kaneo/api` and `@kaneo/web`.
- [x] 7.2 Run API unit tests; add a test for `list-messages` controller (mock db) and `tools.ts` (mock db queries).
- [x] 7.3 Run web tests.
- [x] 7.4 Run `i18n:check` for all locales.
- [x] 7.5 Lint changed files with Biome.
- [x] 7.6 Build `@kaneo/web` to verify route tree generation.
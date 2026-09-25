# route-pi-agent-tools-through-api

Replace direct Drizzle writes inside chat tool implementations with calls to the corresponding task/project controllers, matching the established updateTaskStatusTool pattern. This keeps the chat surface aligned with the public API so authorization, validation, and event publication all flow through one path. Also generates the missing migration that adds paused_reason/claimed_by/claimed_at columns to the task table and applies it to the live DB to fix the schema drift that was uncovered when chat hit the table directly.

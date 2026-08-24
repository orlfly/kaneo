-- agent collaboration: task claim fields and paused reason
ALTER TABLE "task" ADD COLUMN "paused_reason" text;
ALTER TABLE "task" ADD COLUMN "claimed_by" text;
ALTER TABLE "task" ADD COLUMN "claimed_at" timestamp;

-- agent collaboration: audit which API key executed an activity
ALTER TABLE "activity" ADD COLUMN "agent_key_id" text;

-- index for looking up tasks by the API key that claimed them
CREATE INDEX IF NOT EXISTS "task_claimedBy_idx" ON "task" ("claimed_by");
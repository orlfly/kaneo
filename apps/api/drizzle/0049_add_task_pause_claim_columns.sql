ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "paused_reason" text;
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "claimed_by" text;
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp;
ALTER TABLE "activity" ADD COLUMN IF NOT EXISTS "agent_key_id" text;

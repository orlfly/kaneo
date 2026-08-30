ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "review_claimed_by" text;
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "review_claimed_at" timestamp;
CREATE INDEX IF NOT EXISTS "task_reviewClaimedBy_idx" ON "task" USING btree ("review_claimed_by");

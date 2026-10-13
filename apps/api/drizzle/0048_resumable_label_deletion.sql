-- Idempotent guard so re-applying this migration on a database that already
-- has the column (for example when a self-hosted upgrade finds the bookkeeping
-- row behind the actual schema) is a no-op instead of failing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'label' AND column_name = 'deletion_started_at'
  ) THEN
    ALTER TABLE "label" ADD COLUMN "deletion_started_at" timestamp;
  END IF;
END $$;

-- Idempotent guard. The index depends on label.workspace_id, which the later
-- workspace -> team migration (0051) drops. Re-applying this file on a
-- database whose schema already carries 0051's changes must skip the index
-- instead of failing with `column "workspace_id" does not exist`, which is the
-- crash loop self-hosted upgrades hit when the bookkeeping row lags the schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'label' AND column_name = 'workspace_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'label_workspace_cascade_idx'
  ) THEN
    CREATE INDEX "label_workspace_cascade_idx" ON "label" USING btree ("workspace_id","name","created_at","id") WHERE "label"."task_id" is not null;
  END IF;
END $$;

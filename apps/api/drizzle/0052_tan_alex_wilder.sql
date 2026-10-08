-- Restore the github_import table. Migration 0051_dusty_chamber squashed and
-- dropped it while the schema and the resumable-import controllers still
-- depend on it. Idempotent guards keep existing installations (where the table
-- was created by 0050 and survived) from failing on re-apply.
CREATE TABLE IF NOT EXISTS "github_import" (
	"integration_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_import_integration_id_integration_id_fk'
  ) THEN
    ALTER TABLE "github_import" ADD CONSTRAINT "github_import_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE cascade ON UPDATE cascade;
  END IF;
END $$;
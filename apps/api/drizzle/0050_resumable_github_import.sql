-- Idempotent guards so an already-migrated database (or one where a later
-- migration recreated the table) can re-apply this file without failing.
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

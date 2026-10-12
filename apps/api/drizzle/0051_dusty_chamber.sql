-- Workspace -> team migration.
--
-- Every statement carries an idempotent guard. Self-hosted instances can end up
-- with the schema ahead of the drizzle bookkeeping row (the migration history
-- has been renumbered across fork releases), and without these guards the whole
-- migration run aborts and the API crash-loops on startup.
CREATE TABLE IF NOT EXISTS "chat_config" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"api_key_encrypted" text,
	"model" text DEFAULT '' NOT NULL,
	"workdir_root" text,
	"enable_command_execution" boolean DEFAULT false NOT NULL,
	"command_timeout_ms" integer DEFAULT 60000 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notification_team_project" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"team_rule_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_notification_team_project_rule_project_unique" UNIQUE("team_rule_id","project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notification_team_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"ntfy_enabled" boolean DEFAULT false NOT NULL,
	"gotify_enabled" boolean DEFAULT false NOT NULL,
	"webhook_enabled" boolean DEFAULT false NOT NULL,
	"project_mode" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_notification_team_rule_user_team_unique" UNIQUE("user_id","team_id"),
	CONSTRAINT "user_notification_team_rule_team_id_id_unique" UNIQUE("team_id","id")
);
--> statement-breakpoint
-- The workspace-scoped tables are dropped below. Disable row level security
-- first, only for the ones that still exist.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'billing_event', 'billing_reminder_sent', 'github_import', 'invitation',
    'workspace_role', 'trial_grant', 'user_notification_workspace_project',
    'user_notification_workspace_rule', 'workspace', 'workspace_billing',
    'workspace_member'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "billing_event" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "billing_reminder_sent" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "github_import" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "invitation" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_role" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "trial_grant" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "user_notification_workspace_project" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "user_notification_workspace_rule" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "workspace" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_billing" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_member" CASCADE;
--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_workspace_id_id_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "asset_workspaceId_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "label_workspace_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "label_workspace_cascade_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "label_workspace_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "project_workspaceId_position_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "team_workspaceId_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "teamMember_teamId_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "teamMember_userId_idx";
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN IF NOT EXISTS "agent_key_id" text;
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "team_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "label" ADD COLUMN IF NOT EXISTS "team_id" text;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "team_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "paused_reason" text;
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "claimed_by" text;
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "required_role" text;
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "review_claimed_by" text;
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "review_claimed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "slug" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'member' NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN IF NOT EXISTS "joined_at" timestamp NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "username" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "display_username" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_team_id_id_unique') THEN
    ALTER TABLE "project" ADD CONSTRAINT "project_team_id_id_unique" UNIQUE("team_id","id");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_message_project_id_project_id_fk') THEN
    ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_team_project_team_id_team_id_fk') THEN
    ALTER TABLE "user_notification_team_project" ADD CONSTRAINT "user_notification_team_project_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_team_project_team_id_team_rule_id_user_notification_team_rule_team_id_id_fk') THEN
    ALTER TABLE "user_notification_team_project" ADD CONSTRAINT "user_notification_team_project_team_id_team_rule_id_user_notification_team_rule_team_id_id_fk" FOREIGN KEY ("team_id","team_rule_id") REFERENCES "public"."user_notification_team_rule"("team_id","id") ON DELETE cascade ON UPDATE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_team_project_team_id_project_id_project_team_id_id_fk') THEN
    ALTER TABLE "user_notification_team_project" ADD CONSTRAINT "user_notification_team_project_team_id_project_id_project_team_id_id_fk" FOREIGN KEY ("team_id","project_id") REFERENCES "public"."project"("team_id","id") ON DELETE cascade ON UPDATE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_team_rule_user_id_user_id_fk') THEN
    ALTER TABLE "user_notification_team_rule" ADD CONSTRAINT "user_notification_team_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_team_rule_team_id_team_id_fk') THEN
    ALTER TABLE "user_notification_team_rule" ADD CONSTRAINT "user_notification_team_rule_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_projectId_idx" ON "chat_message" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_createdAt_idx" ON "chat_message" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_notification_team_project_ruleId_idx" ON "user_notification_team_project" USING btree ("team_rule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_notification_team_project_projectId_idx" ON "user_notification_team_project" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_notification_team_project_teamId_projectId_idx" ON "user_notification_team_project" USING btree ("team_id","project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "untp_teamId_teamRuleId_idx" ON "user_notification_team_project" USING btree ("team_id","team_rule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_notification_team_rule_userId_idx" ON "user_notification_team_rule" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_notification_team_rule_teamId_idx" ON "user_notification_team_rule" USING btree ("team_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_team_id_team_id_fk') THEN
    ALTER TABLE "asset" ADD CONSTRAINT "asset_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'label_team_id_team_id_fk') THEN
    ALTER TABLE "label" ADD CONSTRAINT "label_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_team_id_team_id_fk') THEN
    ALTER TABLE "project" ADD CONSTRAINT "project_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_teamId_idx" ON "asset" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "label_team_id_idx" ON "label" USING btree ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "label_team_name_unique" ON "label" USING btree ("team_id","name") WHERE "label"."task_id" is null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_teamId_position_idx" ON "project" USING btree ("team_id","position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_claimedBy_idx" ON "task" USING btree ("claimed_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_reviewClaimedBy_idx" ON "task" USING btree ("review_claimed_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_member_teamId_idx" ON "team_member" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_member_userId_idx" ON "team_member" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "asset" DROP COLUMN IF EXISTS "workspace_id";
--> statement-breakpoint
ALTER TABLE "label" DROP COLUMN IF EXISTS "workspace_id";
--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN IF EXISTS "workspace_id";
--> statement-breakpoint
ALTER TABLE "team" DROP COLUMN IF EXISTS "workspace_id";
--> statement-breakpoint
ALTER TABLE "team" DROP COLUMN IF EXISTS "updated_at";
--> statement-breakpoint
ALTER TABLE "team_member" DROP COLUMN IF EXISTS "created_at";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_slug_unique') THEN
    ALTER TABLE "team" ADD CONSTRAINT "team_slug_unique" UNIQUE("slug");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_member_team_user_unique') THEN
    ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_user_unique" UNIQUE("team_id","user_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_username_unique') THEN
    ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");
  END IF;
END $$;

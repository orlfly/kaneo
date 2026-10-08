CREATE TABLE "chat_config" (
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
CREATE TABLE "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notification_team_project" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"team_rule_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_notification_team_project_rule_project_unique" UNIQUE("team_rule_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "user_notification_team_rule" (
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
ALTER TABLE "billing_event" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_reminder_sent" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_import" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitation" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_role" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trial_grant" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_notification_workspace_project" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_notification_workspace_rule" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_billing" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_member" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "billing_event" CASCADE;--> statement-breakpoint
DROP TABLE "billing_reminder_sent" CASCADE;--> statement-breakpoint
DROP TABLE "github_import" CASCADE;--> statement-breakpoint
DROP TABLE "invitation" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_role" CASCADE;--> statement-breakpoint
DROP TABLE "trial_grant" CASCADE;--> statement-breakpoint
DROP TABLE "user_notification_workspace_project" CASCADE;--> statement-breakpoint
DROP TABLE "user_notification_workspace_rule" CASCADE;--> statement-breakpoint
DROP TABLE "workspace" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_billing" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_member" CASCADE;--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_workspace_id_id_unique";--> statement-breakpoint
DROP INDEX "asset_workspaceId_idx";--> statement-breakpoint
DROP INDEX "label_workspace_id_idx";--> statement-breakpoint
DROP INDEX "label_workspace_cascade_idx";--> statement-breakpoint
DROP INDEX "label_workspace_name_unique";--> statement-breakpoint
DROP INDEX "project_workspaceId_position_idx";--> statement-breakpoint
DROP INDEX "team_workspaceId_idx";--> statement-breakpoint
DROP INDEX "teamMember_teamId_idx";--> statement-breakpoint
DROP INDEX "teamMember_userId_idx";--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "agent_key_id" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "team_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "label" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "team_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "paused_reason" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "claimed_at" timestamp;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "required_role" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "review_claimed_by" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "review_claimed_at" timestamp;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN "joined_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_team_id_id_unique" UNIQUE("team_id","id");--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_team_project" ADD CONSTRAINT "user_notification_team_project_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_notification_team_project" ADD CONSTRAINT "user_notification_team_project_team_id_team_rule_id_user_notification_team_rule_team_id_id_fk" FOREIGN KEY ("team_id","team_rule_id") REFERENCES "public"."user_notification_team_rule"("team_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_notification_team_project" ADD CONSTRAINT "user_notification_team_project_team_id_project_id_project_team_id_id_fk" FOREIGN KEY ("team_id","project_id") REFERENCES "public"."project"("team_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_notification_team_rule" ADD CONSTRAINT "user_notification_team_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_notification_team_rule" ADD CONSTRAINT "user_notification_team_rule_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "chat_message_projectId_idx" ON "chat_message" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "chat_message_createdAt_idx" ON "chat_message" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_notification_team_project_ruleId_idx" ON "user_notification_team_project" USING btree ("team_rule_id");--> statement-breakpoint
CREATE INDEX "user_notification_team_project_projectId_idx" ON "user_notification_team_project" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "user_notification_team_project_teamId_projectId_idx" ON "user_notification_team_project" USING btree ("team_id","project_id");--> statement-breakpoint
CREATE INDEX "untp_teamId_teamRuleId_idx" ON "user_notification_team_project" USING btree ("team_id","team_rule_id");--> statement-breakpoint
CREATE INDEX "user_notification_team_rule_userId_idx" ON "user_notification_team_rule" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_notification_team_rule_teamId_idx" ON "user_notification_team_rule" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "asset_teamId_idx" ON "asset" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "label_team_id_idx" ON "label" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "label_team_name_unique" ON "label" USING btree ("team_id","name") WHERE "label"."task_id" is null;--> statement-breakpoint
CREATE INDEX "project_teamId_position_idx" ON "project" USING btree ("team_id","position");--> statement-breakpoint
CREATE INDEX "task_claimedBy_idx" ON "task" USING btree ("claimed_by");--> statement-breakpoint
CREATE INDEX "task_reviewClaimedBy_idx" ON "task" USING btree ("review_claimed_by");--> statement-breakpoint
CREATE INDEX "team_member_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_member_userId_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "asset" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "label" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "team" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "team" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "team_member" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_user_unique" UNIQUE("team_id","user_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");
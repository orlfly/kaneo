-- Introduce teams as the top-level organizational unit (replaces workspace).
-- Drop billing, role-matrix, and the unused vestigial team tables.

-- Drop references to the vestigial team/team_member tables before dropping them.
ALTER TABLE "invitation" DROP CONSTRAINT IF EXISTS "invitation_team_id_team_id_fk";
ALTER TABLE "invitation" DROP COLUMN IF EXISTS "team_id";

DROP TABLE IF EXISTS "team_member";
DROP TABLE IF EXISTS "team";

-- Drop billing and role-matrix tables (features removed).
DROP TABLE IF EXISTS "billing_reminder_sent";
DROP TABLE IF EXISTS "billing_event";
DROP TABLE IF EXISTS "trial_grant";
DROP TABLE IF EXISTS "workspace_role";
DROP TABLE IF EXISTS "workspace_billing";

-- Rename workspace -> team (top-level team).
ALTER TABLE "workspace" RENAME TO "team";
ALTER TABLE "team" DROP COLUMN IF EXISTS "logo";
ALTER TABLE "team" DROP COLUMN IF EXISTS "metadata";
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;

-- Rename workspace_member -> team_member and enforce uniqueness per team.
ALTER TABLE "workspace_member" RENAME TO "team_member";
ALTER TABLE "team_member" RENAME COLUMN "workspace_id" TO "team_id";
ALTER INDEX IF EXISTS "workspace_member_workspaceId_idx" RENAME TO "team_member_teamId_idx";
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_user_unique" UNIQUE ("team_id", "user_id");

-- project: workspace_id -> team_id.
ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_workspace_id_workspace_id_fk";
ALTER TABLE "project" RENAME COLUMN "workspace_id" TO "team_id";
ALTER TABLE "project" ADD CONSTRAINT "project_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER INDEX IF EXISTS "project_workspaceId_position_idx" RENAME TO "project_teamId_position_idx";

-- asset: workspace_id -> team_id.
ALTER TABLE "asset" DROP CONSTRAINT IF EXISTS "asset_workspace_id_workspace_id_fk";
ALTER TABLE "asset" RENAME COLUMN "workspace_id" TO "team_id";
ALTER TABLE "asset" ADD CONSTRAINT "asset_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER INDEX IF EXISTS "asset_workspaceId_idx" RENAME TO "asset_teamId_idx";

-- label: workspace_id -> team_id.
ALTER TABLE "label" DROP CONSTRAINT IF EXISTS "label_workspace_id_workspace_id_fk";
ALTER TABLE "label" RENAME COLUMN "workspace_id" TO "team_id";
ALTER TABLE "label" ADD CONSTRAINT "label_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER INDEX IF EXISTS "label_workspace_id_idx" RENAME TO "label_team_id_idx";
ALTER INDEX IF EXISTS "label_workspace_name_unique" RENAME TO "label_team_name_unique";

-- invitation: workspace_id -> team_id (the invite target is now the team).
ALTER TABLE "invitation" DROP CONSTRAINT IF EXISTS "invitation_workspace_id_workspace_id_fk";
ALTER TABLE "invitation" RENAME COLUMN "workspace_id" TO "team_id";
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE;
ALTER INDEX IF EXISTS "invitation_workspaceId_idx" RENAME TO "invitation_teamId_idx";

-- notification rule tables: rename to team variants and repoint workspace_id -> team_id.
ALTER TABLE "user_notification_workspace_rule" RENAME TO "user_notification_team_rule";
ALTER TABLE "user_notification_team_rule" DROP CONSTRAINT IF EXISTS "user_notification_workspace_rule_workspace_id_workspace_id_fk";
ALTER TABLE "user_notification_team_rule" RENAME COLUMN "workspace_id" TO "team_id";
ALTER TABLE "user_notification_team_rule" ADD CONSTRAINT "user_notification_team_rule_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER INDEX IF EXISTS "user_notification_workspace_rule_workspaceId_idx" RENAME TO "user_notification_team_rule_teamId_idx";

ALTER TABLE "user_notification_workspace_project" RENAME TO "user_notification_team_project";
ALTER TABLE "user_notification_team_project" DROP CONSTRAINT IF EXISTS "user_notification_workspace_project_workspace_id_workspace_id_fk";
ALTER TABLE "user_notification_team_project" DROP CONSTRAINT IF EXISTS "user_notification_workspace_project_workspace_id_workspace_rule_id_user_notification_workspace_rule_workspace_id_id_fk";
ALTER TABLE "user_notification_team_project" DROP CONSTRAINT IF EXISTS "user_notification_workspace_project_workspace_id_project_id_project_workspace_id_id_fk";
ALTER TABLE "user_notification_team_project" RENAME COLUMN "workspace_id" TO "team_id";
ALTER TABLE "user_notification_team_project" RENAME COLUMN "workspace_rule_id" TO "team_rule_id";
ALTER TABLE "user_notification_team_project" ADD CONSTRAINT "user_notification_team_project_team_id_team_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notification_team_project" ADD CONSTRAINT "user_notification_team_project_team_id_team_rule_id_user_notification_team_rule_team_id_id_fk"
  FOREIGN KEY ("team_id", "team_rule_id") REFERENCES "user_notification_team_rule"("team_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notification_team_project" ADD CONSTRAINT "user_notification_team_project_team_id_project_id_project_team_id_id_fk"
  FOREIGN KEY ("team_id", "project_id") REFERENCES "project"("team_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER INDEX IF EXISTS "user_notification_workspace_project_workspaceId_projectId_idx" RENAME TO "user_notification_team_project_teamId_projectId_idx";
ALTER INDEX IF EXISTS "unwp_workspaceId_workspaceRuleId_idx" RENAME TO "untp_teamId_teamRuleId_idx";

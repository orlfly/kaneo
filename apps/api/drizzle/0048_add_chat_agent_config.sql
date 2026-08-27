ALTER TABLE "chat_config" ADD COLUMN IF NOT EXISTS "workdir_root" text;
ALTER TABLE "chat_config" ADD COLUMN IF NOT EXISTS "enable_command_execution" boolean NOT NULL DEFAULT false;
ALTER TABLE "chat_config" ADD COLUMN IF NOT EXISTS "command_timeout_ms" integer NOT NULL DEFAULT 60000;

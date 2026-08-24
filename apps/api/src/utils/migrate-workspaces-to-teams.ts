import { sql } from "drizzle-orm";
import db from "../database";

// Boot-time safety check for the workspace→team rename. The Drizzle migration
// `0044_team_workspace_migration.sql` already renames the legacy tables and
// columns. This helper is a defensive, idempotent check that runs at startup
// to make sure no fresh installs wind up with the legacy table layout in case
// migrations were partially applied on an existing database.
//
// Behavior:
//  - If neither the legacy `workspace` table nor a `team` table exists, no-op.
//  - If both exist (partial migration), fails loudly so the operator can
//    inspect the database state instead of silently corrupting data.
//  - If the legacy `workspace` table exists but `team` does not, that means
//    a database never ran the migration; Drizzle migrator handles that, but
//    we still surface a clear log line.
export async function migrateWorkspacesToTeams(): Promise<void> {
  const teamExists = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'team'
    ) AS exists;
  `);
  const legacyExists = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'workspace'
    ) AS exists;
  `);

  const team =
    teamExists.rows[0]?.exists === true || teamExists.rows[0]?.exists === "t";
  const legacy =
    legacyExists.rows[0]?.exists === true ||
    legacyExists.rows[0]?.exists === "t";

  if (team && legacy) {
    console.error(
      "[migrate-workspaces-to-teams] Detected both `workspace` and `team` tables. " +
        "The Drizzle migration appears to have been partially applied; " +
        "refusing to continue. Inspect the database state manually.",
    );
    throw new Error("Inconsistent workspace/team table state");
  }

  if (!team && !legacy) {
    // Fresh database: nothing to backfill.
    return;
  }

  if (legacy && !team) {
    console.warn(
      "[migrate-workspaces-to-teams] Legacy `workspace` table found but no `team` table. " +
        "Drizzle migrator will run the rename migration `0044_team_workspace_migration.sql` on next startup.",
    );
    return;
  }

  console.log(
    "[migrate-workspaces-to-teams] Team table present; workspace/team layout is up-to-date.",
  );
}

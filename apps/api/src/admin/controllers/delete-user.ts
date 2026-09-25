import { and, eq } from "drizzle-orm";
import db from "../../database";
import { teamMemberTable, userTable } from "../../database/schema";

export async function deleteUser(userId: string) {
  const [target] = await db
    .select({
      id: userTable.id,
      role: userTable.role,
      username: userTable.username,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  if (!target) {
    throw new Error("User not found.");
  }

  if (target.role === "admin") {
    // Never allow removing an administrator (guards against losing the last
    // system admin). Ownership of teams is transferred or revoked
    // explicitly by an administrator before deletion.
    throw new Error("Administrators cannot be deleted from this screen.");
  }

  // Refuse to delete a user who owns a team: deleting the user would
  // cascade and destroy the team. The admin should transfer ownership first.
  const owned = await db
    .select({ id: teamMemberTable.id })
    .from(teamMemberTable)
    .where(
      and(
        eq(teamMemberTable.userId, userId),
        eq(teamMemberTable.role, "owner"),
      ),
    )
    .limit(1);

  if (owned.length > 0) {
    throw new Error(
      "This user owns a workspace. Transfer workspace ownership before deleting the user.",
    );
  }

  // Cascades remove sessions, workspace memberships and other relations.
  await db.delete(userTable).where(eq(userTable.id, userId));

  return { id: userId };
}

export default deleteUser;

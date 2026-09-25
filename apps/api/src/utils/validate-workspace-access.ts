import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";

// Back-compat shim for the old workspace access validator. Routes still
// calling `validateWorkspaceAccess(userId, teamId, apiKeyId?)` will be
// re-checked as a team membership check; apiKeyId is ignored.
export async function validateWorkspaceAccess(
  userId: string,
  teamId: string,
  _apiKeyId?: string,
) {
  const [membership] = await db
    .select({ role: schema.teamMemberTable.role })
    .from(schema.teamMemberTable)
    .where(
      and(
        eq(schema.teamMemberTable.userId, userId),
        eq(schema.teamMemberTable.teamId, teamId),
      ),
    )
    .limit(1);

  if (!membership) {
    // 403 rather than 401: the caller is authenticated but not a member, so
    // revealing the team's existence to a stranger leaks nothing.
    throw new HTTPException(403, { message: "Not a member of this team" });
  }
}

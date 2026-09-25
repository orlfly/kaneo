import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { teamMemberTable } from "../database/schema";

export async function validateTeamAccess(userId: string, teamId: string) {
  const [membership] = await db
    .select({ role: teamMemberTable.role })
    .from(teamMemberTable)
    .where(
      and(
        eq(teamMemberTable.userId, userId),
        eq(teamMemberTable.teamId, teamId),
      ),
    )
    .limit(1);

  if (!membership) {
    // 403 rather than 401: the caller is authenticated but not a member, so
    // revealing the team's existence to a stranger leaks nothing.
    throw new HTTPException(403, { message: "Not a member of this team" });
  }
}

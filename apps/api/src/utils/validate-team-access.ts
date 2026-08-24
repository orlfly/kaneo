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
    throw new HTTPException(401, { message: "Unauthorized" });
  }
}

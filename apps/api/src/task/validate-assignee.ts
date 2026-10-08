import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { projectTable, teamMemberTable } from "../database/schema";

export async function assertProjectAssignee(projectId: string, userId: string) {
  const [member] = await db
    .select({ id: teamMemberTable.id })
    .from(teamMemberTable)
    .innerJoin(projectTable, eq(projectTable.teamId, teamMemberTable.teamId))
    .where(
      and(eq(projectTable.id, projectId), eq(teamMemberTable.userId, userId)),
    )
    .limit(1);
  if (!member) {
    throw new HTTPException(400, {
      message: "Assignee must be a current team member",
    });
  }
}

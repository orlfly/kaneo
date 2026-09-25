import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";

const NOT_ASSIGNABLE = "Assignee is not a member of this team";

export async function filterAssignableUsers(
  userIds: string[],
  teamId: string,
): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }

  const memberships = await db
    .select({ userId: schema.teamMemberTable.userId })
    .from(schema.teamMemberTable)
    .where(
      and(
        inArray(schema.teamMemberTable.userId, userIds),
        eq(schema.teamMemberTable.teamId, teamId),
      ),
    );

  const assignable = new Set(memberships.map((row) => row.userId));
  const remaining = userIds.filter((id) => !assignable.has(id));

  if (remaining.length === 0) {
    return assignable;
  }

  const admins = await db
    .select({ id: schema.userTable.id })
    .from(schema.userTable)
    .where(
      and(
        inArray(schema.userTable.id, remaining),
        eq(schema.userTable.role, "admin"),
      ),
    );

  for (const admin of admins) {
    assignable.add(admin.id);
  }

  return assignable;
}

export async function assertAssignableUser(
  userId: string,
  teamId: string,
): Promise<void> {
  const assignable = await filterAssignableUsers([userId], teamId);

  if (!assignable.has(userId)) {
    throw new HTTPException(403, { message: NOT_ASSIGNABLE });
  }
}

export async function getProjectTeamId(projectId: string): Promise<string> {
  const [project] = await db
    .select({ teamId: schema.projectTable.teamId })
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, projectId))
    .limit(1);

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  return project.teamId;
}

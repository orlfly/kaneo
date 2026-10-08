import { and, eq, type SQLWrapper, sql } from "drizzle-orm";
import db from "../database";
import { userTable } from "../database/schema";

// Membership, rather than public visibility or global admin privileges, defines
// who may be subscribed to private task activity. Use the same predicate when
// creating, reading and delivering notifications, including historical rows.
// Fork note: the workspace model is replaced by teams; resourceType "workspace"
// from the upstream surface maps onto team membership here.
export function notificationResourceAccess(
  userId: string,
  resourceId: string | null | SQLWrapper,
  resourceType: string | null | SQLWrapper,
) {
  return sql<boolean>`(
    (${resourceId}::text IS NULL AND ${resourceType}::text IS NULL)
    OR (${resourceType}::text = 'task' AND EXISTS (
      SELECT 1 FROM task AS notification_task
      JOIN project AS notification_project ON notification_project.id = notification_task.project_id
      JOIN team_member AS notification_member ON notification_member.team_id = notification_project.team_id
      WHERE notification_task.id = ${resourceId} AND notification_member.user_id = ${userId}
    ))
    OR (${resourceType}::text IN ('workspace', 'team') AND EXISTS (
      SELECT 1 FROM team_member AS notification_member
      WHERE notification_member.team_id = ${resourceId} AND notification_member.user_id = ${userId}
    ))
  )`;
}

export async function canReceiveResourceNotification(
  userId: string,
  resourceId?: string | null,
  resourceType?: string | null,
) {
  const [user] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(
      and(
        eq(userTable.id, userId),
        notificationResourceAccess(
          userId,
          resourceId ?? null,
          resourceType ?? null,
        ),
      ),
    )
    .limit(1);
  return Boolean(user);
}

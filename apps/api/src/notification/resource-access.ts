import { and, eq, type SQLWrapper, sql } from "drizzle-orm";
import db from "../database";
import { userTable } from "../database/schema";
import { notBannedCondition } from "../utils/user-ban";

// Membership, rather than public visibility or global admin privileges, defines
// who may be subscribed to private task activity. Archived teams hide their
// notifications until restored. Use the same predicate when creating, reading
// and delivering notifications, including historical rows.
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
      JOIN team AS notification_team ON notification_team.id = notification_project.team_id
      WHERE notification_task.id = ${resourceId} AND notification_member.user_id = ${userId}
        AND notification_team.archived_at IS NULL
    ))
    OR (${resourceType}::text IN ('workspace', 'team') AND EXISTS (
      SELECT 1 FROM team_member AS notification_member
      JOIN team AS notification_team ON notification_team.id = notification_member.team_id
      WHERE notification_member.team_id = ${resourceId} AND notification_member.user_id = ${userId}
        AND notification_team.archived_at IS NULL
    ))
  )`;
}

// Kept for callers that pass the caller's API key scope and a team filter. The
// fork's team model grants every member read access, so membership is the only
// condition; the parameters stay in the signature to mirror the route contract.

export async function notificationReadAccess(
  userId: string,
  resourceId: string | null | SQLWrapper,
  resourceType: string | null | SQLWrapper,
  _apiKeyPermissions?: Record<string, string[]> | null,
  _teamId?: string,
) {
  return notificationResourceAccess(userId, resourceId, resourceType);
}

export async function canReceiveResourceNotification(
  userId: string,
  resourceId?: string | null,
  resourceType?: string | null,
  database: Pick<typeof db, "select"> = db,
) {
  const [user] = await database
    .select({ id: userTable.id })
    .from(userTable)
    .where(
      and(
        eq(userTable.id, userId),
        notBannedCondition(),
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

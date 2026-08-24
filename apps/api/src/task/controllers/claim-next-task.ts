import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";

import db from "../../database";
import {
  projectTable,
  taskTable,
  teamMemberTable,
} from "../../database/schema";
import { claimTask } from "./claim-task";

/**
 * Find the best unclaimed to-do task across the caller's team projects and
 * atomically claim it. Priority ordering: dueDate ASC (soonest first),
 * priority DESC (urgent first), createdAt ASC (oldest first).
 */
export async function claimNextTask({
  userId,
  agentKeyId,
  projectId,
  priorities,
}: {
  userId: string;
  agentKeyId?: string;
  projectId?: string;
  priorities?: string[];
}): Promise<{
  taskId: string;
  title: string;
  status: string;
  claimed: true;
} | null> {
  // Find all team IDs the user belongs to.
  const teamMemberships = await db
    .select({ teamId: teamMemberTable.teamId })
    .from(teamMemberTable)
    .where(eq(teamMemberTable.userId, userId));

  if (teamMemberships.length === 0) {
    return null;
  }

  const teamIds = teamMemberships.map((m) => m.teamId);

  // Find all projects in those teams (or just the specified project).
  const projectQuery = projectId
    ? and(eq(projectTable.id, projectId), inArray(projectTable.teamId, teamIds))
    : inArray(projectTable.teamId, teamIds);

  const projects = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(projectQuery);

  if (projects.length === 0) {
    return null;
  }

  const projectIds = projects.map((p) => p.id);

  // Build the candidate query: unclaimed to-do tasks in those projects.
  const conditions: SQL[] = [
    inArray(taskTable.projectId, projectIds),
    eq(taskTable.status, "to-do"),
    isNull(taskTable.userId),
  ];

  if (priorities && priorities.length > 0) {
    conditions.push(inArray(taskTable.priority, priorities));
  }

  // Priority weight: urgent=4, high=3, medium=2, low=1, no-priority=0
  const priorityWeight = sql<number>`CASE
    WHEN ${taskTable.priority} = 'urgent' THEN 4
    WHEN ${taskTable.priority} = 'high' THEN 3
    WHEN ${taskTable.priority} = 'medium' THEN 2
    WHEN ${taskTable.priority} = 'low' THEN 1
    ELSE 0
  END`;

  // Order: dueDate ASC (nulls last), priority DESC, createdAt ASC
  const candidates = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(and(...conditions))
    .orderBy(
      // NULLS LAST for dueDate: tasks with no due date go to the end.
      sql`${taskTable.dueDate} ASC NULLS LAST`,
      desc(priorityWeight),
      asc(taskTable.createdAt),
    )
    .limit(1);

  if (candidates.length === 0) {
    return null;
  }

  const bestTaskId = candidates[0]?.id;
  if (!bestTaskId) {
    return null;
  }

  // Atomically claim it. If another agent beat us, return null (caller can retry).
  try {
    return await claimTask({
      taskId: bestTaskId,
      userId,
      agentKeyId,
    });
  } catch {
    // The claim failed (e.g. race condition). Return null rather than retrying
    // to keep the endpoint single-shot.
    return null;
  }
}

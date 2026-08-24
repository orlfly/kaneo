import type { AgentRole } from "@kaneo/permissions";
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
  agentRole,
}: {
  userId: string;
  agentKeyId?: string;
  projectId?: string;
  priorities?: string[];
  agentRole?: AgentRole;
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

  // Three-rule candidate matching:
  // 1. Assigned to me (rule 1) — these are picked first via the union below.
  // 2. Unassigned AND role matches: requiredRole IS NULL OR requiredRole = agentRole.
  // 3. Status is in the claimable set (currently "to-do").
  const claimableStatuses = ["to-do"] as const;

  // Build a parameterized conditions array, with the assigned-to-me rule
  // expressed as a subquery against the same set.
  // To keep one query that prefers assigned-to-me, we'll do two queries:
  // first assigned-to-me, then role-matched unassigned. This preserves
  // the existing ordering within each group.
  const baseAssignedConditions: SQL[] = [
    inArray(taskTable.projectId, projectIds),
    inArray(taskTable.status, [...claimableStatuses]),
    eq(taskTable.userId, userId),
  ];
  const baseUnassignedConditions: SQL[] = [
    inArray(taskTable.projectId, projectIds),
    inArray(taskTable.status, [...claimableStatuses]),
    isNull(taskTable.userId),
  ];
  // Rule 2 (role match): only add when the caller's agent role is known,
  // otherwise every unassigned task is implicitly eligible.
  if (agentRole !== undefined) {
    baseUnassignedConditions.push(
      sql<boolean>`(${taskTable.requiredRole} IS NULL OR ${taskTable.requiredRole} = ${agentRole})`,
    );
  } else {
    baseUnassignedConditions.push(isNull(taskTable.requiredRole));
  }

  if (priorities && priorities.length > 0) {
    baseUnassignedConditions.push(inArray(taskTable.priority, priorities));
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
  const orderBy = [
    sql`${taskTable.dueDate} ASC NULLS LAST`,
    desc(priorityWeight),
    asc(taskTable.createdAt),
  ];

  // Rule 1 (assigned to me) wins over Rule 2 (role-matched unassigned).
  const assignedCandidates = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(and(...baseAssignedConditions))
    .orderBy(...orderBy)
    .limit(1);

  let candidates = assignedCandidates;
  if (candidates.length === 0) {
    const roleMatched = await db
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(and(...baseUnassignedConditions))
      .orderBy(...orderBy)
      .limit(1);
    candidates = roleMatched;
  }

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
      agentRole,
    });
  } catch {
    // The claim failed (e.g. race condition). Return null rather than retrying
    // to keep the endpoint single-shot.
    return null;
  }
}

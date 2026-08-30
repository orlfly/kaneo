import type { AgentRole } from "@kaneo/permissions";
import { HUMAN_REQUIRED_ROLE } from "@kaneo/permissions";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
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
  // 1. My current assignment (rule 1) — picked first via the union below.
  //    - implementation roles: tasks assigned to me (userId === caller)
  //    - code-review: tasks whose review lock is held by me (resume an
  //      in-flight review instead of grabbing another one)
  // 2. Free (rule 2): unassigned OR review unclaimed, and role matches.
  //    - code-review: any in-review task whose review is unclaimed (ignoring
  //      requiredRole, EXCEPT never `human`)
  //    - implementation roles: to-do tasks with requiredRole null or my role
  //    - human callers: to-do tasks with requiredRole null or "human"
  const isCodeReview = agentRole === "code-review";
  const claimableStatuses = isCodeReview ? ["in-review"] : ["to-do"];

  const mineCondition: SQL = isCodeReview
    ? eq(taskTable.reviewClaimedBy, agentKeyId ?? "")
    : eq(taskTable.userId, userId);
  const freeCondition: SQL = isCodeReview
    ? isNull(taskTable.reviewClaimedBy)
    : isNull(taskTable.userId);

  const baseMineConditions: SQL[] = [
    inArray(taskTable.projectId, projectIds),
    inArray(taskTable.status, [...claimableStatuses]),
    mineCondition,
  ];
  const baseFreeConditions: SQL[] = [
    inArray(taskTable.projectId, projectIds),
    inArray(taskTable.status, [...claimableStatuses]),
    freeCondition,
  ];
  // Rule 2 (role match): only add when the caller's agent role is known,
  // otherwise every free task is implicitly eligible.
  // code-review agents still ignore requiredRole but never get a `human`-marked
  // task. Other agents use the standard null-or-equals clause which already
  // excludes "human" (it is not equal to any agent role).
  if (isCodeReview) {
    baseMineConditions.push(ne(taskTable.requiredRole, HUMAN_REQUIRED_ROLE));
    baseFreeConditions.push(ne(taskTable.requiredRole, HUMAN_REQUIRED_ROLE));
  } else if (agentRole !== undefined) {
    // A task I already own is always reclaimable regardless of requiredRole.
    baseFreeConditions.push(
      sql<boolean>`(${taskTable.requiredRole} IS NULL OR ${taskTable.requiredRole} = ${agentRole})`,
    );
  } else {
    // Human caller: take null or human-required tasks.
    baseFreeConditions.push(
      sql<boolean>`(${taskTable.requiredRole} IS NULL OR ${taskTable.requiredRole} = ${HUMAN_REQUIRED_ROLE})`,
    );
  }

  if (priorities && priorities.length > 0) {
    baseFreeConditions.push(inArray(taskTable.priority, priorities));
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

  // Rule 1 (my current assignment) wins over Rule 2 (free, role-matched).
  const mineCandidates = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(and(...baseMineConditions))
    .orderBy(...orderBy)
    .limit(1);

  let candidates = mineCandidates;
  if (candidates.length === 0) {
    const roleMatched = await db
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(and(...baseFreeConditions))
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

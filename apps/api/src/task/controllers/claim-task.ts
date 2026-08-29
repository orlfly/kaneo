import type { AgentRole } from "@kaneo/permissions";
import { HUMAN_REQUIRED_ROLE, isHumanRequiredRole } from "@kaneo/permissions";
import { and, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import { publishEvent } from "../../events";

type ClaimResult = {
  taskId: string;
  title: string;
  status: string;
  claimed: true;
};

/**
 * Atomically claim a task for the current user. The UPDATE ... WHERE
 * userId IS NULL guard ensures only one concurrent caller wins.
 */
export async function claimTask({
  taskId,
  userId,
  agentKeyId,
  agentRole,
}: {
  taskId: string;
  userId: string;
  agentKeyId?: string;
  agentRole?: AgentRole;
}): Promise<ClaimResult> {
  const now = new Date();

  const isCodeReview = agentRole === "code-review";
  const claimableStatus = isCodeReview ? "in-review" : "to-do";

  // Verify the task is claimable by this agent before locking on it.
  // Rule 1 (assigned to me): userId === caller; or
  // Rule 2 (role match): unassigned AND (requiredRole IS NULL or equals my role),
  //   or code-review (which claims any in-review task regardless of requiredRole).
  const [candidate] = await db
    .select({
      id: schema.taskTable.id,
      status: schema.taskTable.status,
      userId: schema.taskTable.userId,
      requiredRole: schema.taskTable.requiredRole,
    })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, taskId))
    .limit(1);

  if (candidate?.status !== claimableStatus) {
    throw new HTTPException(409, {
      message: `Task is not available for claiming (already assigned or not in ${claimableStatus} status)`,
    });
  }

  // A task marked `requiredRole = "human"` is reserved for a human team member.
  // No agent (including code-review) may claim it. Humans without an API key
  // (agentRole === undefined) may claim it as long as they meet the other rules.
  const taskRequiresHuman = isHumanRequiredRole(candidate.requiredRole);
  if (taskRequiresHuman && agentRole !== undefined) {
    throw new HTTPException(403, {
      message: "Task is reserved for human team members",
    });
  }

  const assignedToMe = candidate.userId === userId;
  const roleMatched =
    (isCodeReview && candidate.status === "in-review") ||
    (!isCodeReview &&
      candidate.userId === null &&
      // Human-claim branch: when caller has no agent role, they may claim a
      // generic (null) task or an explicitly human-only task, but never a
      // task restricted to one of the seven agent roles.
      (agentRole === undefined
        ? taskRequiresHuman || candidate.requiredRole === null
        : candidate.requiredRole === null ||
          candidate.requiredRole === agentRole));
  if (!assignedToMe && !roleMatched) {
    throw new HTTPException(403, {
      message:
        "Task is not claimable by this agent role (assignee mismatch or required role does not match)",
    });
  }

  // Re-check under the row lock
  const whereClauses = [
    eq(schema.taskTable.id, taskId),
    eq(schema.taskTable.status, claimableStatus),
  ];
  if (assignedToMe) {
    whereClauses.push(eq(schema.taskTable.userId, userId));
  } else if (isCodeReview) {
    // code-review claims any in-review task (except `human`, already excluded above), ignoring requiredRole.
  } else {
    whereClauses.push(isNull(schema.taskTable.userId));
    if (agentRole !== undefined) {
      // Re-agents must additionally be an agent role, and requiredRole is
      // either null or exactly their role. (`human` is already rejected above.)
      whereClauses.push(
        sql<boolean>`(${schema.taskTable.requiredRole} IS NULL OR ${schema.taskTable.requiredRole} = ${agentRole})`,
      );
    } else {
      // Human claimers may take null or human-required tasks.
      whereClauses.push(
        sql<boolean>`(${schema.taskTable.requiredRole} IS NULL OR ${schema.taskTable.requiredRole} = ${HUMAN_REQUIRED_ROLE})`,
      );
    }
  }

  const [claimed] = await db
    .update(schema.taskTable)
    .set({
      userId,
      claimedBy: agentKeyId ?? null,
      claimedAt: now,
      status: "in-progress",
    })
    .where(and(...whereClauses))
    .returning();

  if (!claimed) {
    throw new HTTPException(409, {
      message:
        "Task is not available for claiming (already assigned or not in to-do status)",
    });
  }

  // Audit trail: record who claimed via which API key.
  await db.insert(schema.activityTable).values({
    taskId: claimed.id,
    type: "claimed",
    userId,
    agentKeyId: agentKeyId ?? null,
    content: null,
    eventData: { agentKeyId: agentKeyId ?? null },
  });

  await publishEvent("task.claimed", {
    taskId: claimed.id,
    projectId: claimed.projectId,
    userId,
    title: claimed.title,
    type: "claimed",
  });

  // Also emit status_changed so integrations/realtime update.
  await publishEvent("task.status_changed", {
    taskId: claimed.id,
    projectId: claimed.projectId,
    userId,
    oldStatus: "to-do",
    newStatus: "in-progress",
    title: claimed.title,
    assigneeId: userId,
    type: "status_changed",
  });

  return {
    taskId: claimed.id,
    title: claimed.title,
    status: claimed.status,
    claimed: true,
  };
}
export default claimTask;

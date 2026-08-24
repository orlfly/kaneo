import type { AgentRole } from "@kaneo/permissions";
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

  // Verify the task is claimable by this agent before locking on it.
  // Rule 1 (assigned to me): userId === caller; or
  // Rule 2 (role match): unassigned AND (requiredRole IS NULL OR equals my role).
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

  if (candidate?.status !== "to-do") {
    throw new HTTPException(409, {
      message:
        "Task is not available for claiming (already assigned or not in to-do status)",
    });
  }

  const assignedToMe = candidate.userId === userId;
  const roleMatched =
    candidate.userId === null &&
    (candidate.requiredRole === null ||
      (agentRole !== undefined && candidate.requiredRole === agentRole));
  if (!assignedToMe && !roleMatched) {
    throw new HTTPException(403, {
      message:
        "Task is not claimable by this agent role (assignee mismatch or required role does not match)",
    });
  }

  // Re-check under the row lock
  const whereClauses = [
    eq(schema.taskTable.id, taskId),
    eq(schema.taskTable.status, "to-do"),
  ];
  if (assignedToMe) {
    whereClauses.push(eq(schema.taskTable.userId, userId));
  } else {
    whereClauses.push(isNull(schema.taskTable.userId));
    if (agentRole !== undefined) {
      whereClauses.push(
        sql<boolean>`(${schema.taskTable.requiredRole} IS NULL OR ${schema.taskTable.requiredRole} = ${agentRole})`,
      );
    } else {
      whereClauses.push(isNull(schema.taskTable.requiredRole));
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

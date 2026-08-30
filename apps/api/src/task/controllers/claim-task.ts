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
 * guard ensures only one concurrent caller wins.
 *
 * Two distinct claim kinds:
 *
 * 1. Implementation claim (all roles except code-review): claims a `to-do`
 *    task, sets the assignee (userId/claimedBy/claimedAt) and moves it to
 *    `in-progress`.
 *
 * 2. Review claim (code-review): claims an `in-review` task by taking the
 *    review lock (reviewClaimedBy/reviewClaimedAt). It never touches the
 *    implementer's claim fields (userId/claimedBy/claimedAt) and leaves the
 *    status `in-review`, so concurrent reviewers are excluded via the lock
 *    while the original attribution is preserved.
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
  const [candidate] = await db
    .select({
      id: schema.taskTable.id,
      status: schema.taskTable.status,
      userId: schema.taskTable.userId,
      requiredRole: schema.taskTable.requiredRole,
      reviewClaimedBy: schema.taskTable.reviewClaimedBy,
      title: schema.taskTable.title,
    })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, taskId))
    .limit(1);

  if (!candidate) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const isMineInProgress =
    !isCodeReview &&
    candidate.status === "in-progress" &&
    candidate.userId === userId;
  const statusAllowed = isCodeReview
    ? candidate.status === "in-review"
    : candidate.status === "to-do" || isMineInProgress;
  if (!statusAllowed) {
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

  // Mutex: if another reviewer already holds the review lock, this task is
  // busy, not merely role-ineligible.
  const reviewTakenByOther =
    isCodeReview &&
    candidate.reviewClaimedBy != null &&
    candidate.reviewClaimedBy !== agentKeyId;
  if (reviewTakenByOther) {
    throw new HTTPException(409, {
      message: "Task review is already claimed by another reviewer",
    });
  }

  const assignedToMe = candidate.userId === userId;
  const roleMatched =
    // code-review ignores userId entirely: it matches any in-review task that
    // is not already under review by another key (checked above).
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

  // Resuming my own in-progress task (e.g. a task sent back for rework): it
  // is already assigned to me and already in-progress, so claiming is a no-op.
  if (isMineInProgress) {
    return {
      taskId: candidate.id,
      title: candidate.title ?? "",
      status: "in-progress",
      claimed: true,
    };
  }

  // Re-check under the row lock
  const whereClauses = [
    eq(schema.taskTable.id, taskId),
    eq(schema.taskTable.status, claimableStatus),
  ];
  if (assignedToMe) {
    whereClauses.push(eq(schema.taskTable.userId, userId));
  } else if (isCodeReview) {
    // Take the review lock only if it is free or already held by this key.
    whereClauses.push(
      sql<boolean>`(${schema.taskTable.reviewClaimedBy} IS NULL OR ${schema.taskTable.reviewClaimedBy} = ${agentKeyId ?? ""})`,
    );
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
    .set(
      isCodeReview
        ? {
            // Review claim: lock the review, never touch implementer fields
            // or the task status.
            reviewClaimedBy: agentKeyId ?? null,
            reviewClaimedAt: now,
          }
        : {
            userId,
            claimedBy: agentKeyId ?? null,
            claimedAt: now,
            status: "in-progress",
          },
    )
    .where(and(...whereClauses))
    .returning();

  if (!claimed) {
    throw new HTTPException(409, {
      message: isCodeReview
        ? "Task review is already claimed by another reviewer"
        : "Task is not available for claiming (already assigned or not in to-do status)",
    });
  }

  // Audit trail: record who claimed (or took the review lock) via which key.
  await db.insert(schema.activityTable).values({
    taskId: claimed.id,
    type: isCodeReview ? "review-claimed" : "claimed",
    userId,
    agentKeyId: agentKeyId ?? null,
    content: null,
    eventData: {
      agentKeyId: agentKeyId ?? null,
      kind: isCodeReview ? "review" : "implementation",
    },
  });

  await publishEvent("task.claimed", {
    taskId: claimed.id,
    projectId: claimed.projectId,
    userId,
    title: claimed.title,
    type: isCodeReview ? "review-claimed" : "claimed",
  });

  // Implementation claims move the task to in-progress and therefore change
  // its status; review claims keep it in-review, so only emit status_changed
  // for the former.
  if (!isCodeReview) {
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
  }

  return {
    taskId: claimed.id,
    title: claimed.title,
    status: claimed.status,
    claimed: true,
  };
}
export default claimTask;

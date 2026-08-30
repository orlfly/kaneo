import type { AgentRole } from "@kaneo/permissions";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { assertValidTaskStatus } from "../validate-task-fields";

async function updateTaskStatus({
  id,
  status,
  currentUserId,
  agentRole,
  agentKeyId,
}: {
  id: string;
  status: string;
  currentUserId: string;
  agentRole?: AgentRole;
  agentKeyId?: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  await assertValidTaskStatus(status, existingTask.projectId);

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, existingTask.projectId),
      eq(columnTable.slug, status),
    ),
  });

  const isReviewer = agentRole === "code-review";
  const leavingInReview =
    existingTask.status === "in-review" && status !== "in-review";
  const hasReviewLock =
    existingTask.reviewClaimedBy != null &&
    existingTask.reviewClaimedBy === agentKeyId;

  // Review ownership guard: an in-review task may only be pulled out of review
  // by the reviewer who holds the lock, or by a human (agentRole undefined).
  // This prevents an implementer (or a different reviewer) from hijacking a
  // review that is in flight.
  if (leavingInReview && agentRole !== undefined && !hasReviewLock) {
    throw new HTTPException(403, {
      message: "Task review is not claimed by you",
    });
  }

  // A reviewer may finish the review (done) or hand the task back for rework
  // (in-progress), but must never resubmit it to in-review (infinite loop).
  if (isReviewer && status === "in-review") {
    throw new HTTPException(409, {
      message: "A reviewer cannot resubmit a task to in-review",
    });
  }

  // When an agent changes status, keep the task's requiredRole aligned with
  // the stage it is entering:
  //   in-progress -> the agent's own role (except reviewer rework: null, so
  //     the original implementer can pick it back up)
  //   in-review   -> code-review (the reviewer)
  //   done        -> null (completed, no longer needs a role)
  // Other statuses leave requiredRole untouched.
  let nextRequiredRole = existingTask.requiredRole;
  if (agentRole !== undefined) {
    if (status === "in-progress") {
      nextRequiredRole = isReviewer ? null : agentRole;
    } else if (status === "in-review") {
      nextRequiredRole = "code-review";
    } else if (status === "done") {
      nextRequiredRole = null;
    }
  }

  // Leaving in-review releases the review lock. The lock is only meaningful
  // while a task is under review, so clear it on any non-in-review status.
  const releaseReviewLock = status !== "in-review";

  const [updatedTask] = await db
    .update(taskTable)
    .set({
      status,
      columnId: column?.id ?? null,
      requiredRole: nextRequiredRole,
      reviewClaimedBy: releaseReviewLock ? null : existingTask.reviewClaimedBy,
      reviewClaimedAt: releaseReviewLock ? null : existingTask.reviewClaimedAt,
    })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task status",
    });
  }

  await publishEvent("task.status_changed", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    userId: currentUserId,
    oldStatus: existingTask.status,
    newStatus: status,
    title: updatedTask.title,
    assigneeId: updatedTask.userId,
    type: "status_changed",
  });

  await publishEvent("task-relation.refresh", {
    projectId: updatedTask.projectId,
    userId: currentUserId,
  });

  return updatedTask;
}

export default updateTaskStatus;

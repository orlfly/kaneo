import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { assertTaskOwnership } from "./assert-task-ownership";

export async function pauseTask({
  taskId,
  reason,
  currentUserId,
}: {
  taskId: string;
  reason: string;
  currentUserId: string;
}) {
  await assertTaskOwnership(taskId, currentUserId);

  const reasonTrimmed = reason.trim();
  if (!reasonTrimmed) {
    throw new HTTPException(400, {
      message: "A pause reason is required",
    });
  }

  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  const [pausedTask] = await db
    .update(taskTable)
    .set({
      status: "paused",
      pausedReason: reasonTrimmed,
      // The review lock only means something while the task is in review.
      // Pausing without clearing it left the task unclaimable by the next
      // reviewer after it resumed.
      reviewClaimedBy: null,
      reviewClaimedAt: null,
    })
    .where(eq(taskTable.id, taskId))
    .returning();

  if (!pausedTask) {
    throw new HTTPException(500, {
      message: "Failed to pause task",
    });
  }

  await publishEvent("task.paused", {
    taskId: pausedTask.id,
    projectId: pausedTask.projectId,
    userId: currentUserId,
    title: pausedTask.title,
    reason: reasonTrimmed,
    oldStatus: existingTask?.status ?? "in-progress",
    type: "paused",
  });

  // `task.paused` drives integrations; `task.status_changed` drives the
  // activity timeline, WebSocket cache updates, and notifications. Emit both
  // so pausing through this endpoint is as visible as pausing through the
  // generic status endpoint.
  await publishEvent("task.status_changed", {
    taskId: pausedTask.id,
    projectId: pausedTask.projectId,
    userId: currentUserId,
    oldStatus: existingTask?.status ?? "in-progress",
    newStatus: "paused",
    title: pausedTask.title,
    assigneeId: pausedTask.userId,
    reason: reasonTrimmed,
    type: "status_changed",
  });

  return pausedTask;
}
export default pauseTask;

import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { assertTaskOwnership } from "./assert-task-ownership";

export async function releaseTask({
  taskId,
  currentUserId,
}: {
  taskId: string;
  currentUserId: string;
}) {
  await assertTaskOwnership(taskId, currentUserId);

  const [releasedTask] = await db
    .update(taskTable)
    .set({
      status: "to-do",
      userId: null,
      claimedBy: null,
      claimedAt: null,
      pausedReason: null,
    })
    .where(eq(taskTable.id, taskId))
    .returning();

  if (!releasedTask) {
    throw new HTTPException(500, {
      message: "Failed to release task",
    });
  }

  await publishEvent("task.released", {
    taskId: releasedTask.id,
    projectId: releasedTask.projectId,
    userId: currentUserId,
    title: releasedTask.title,
    type: "released",
  });

  // Also emit status_changed so integrations/realtime update.
  const oldStatus = "paused"; // Most likely paused or in-progress
  await publishEvent("task.status_changed", {
    taskId: releasedTask.id,
    projectId: releasedTask.projectId,
    userId: currentUserId,
    oldStatus,
    newStatus: "to-do",
    title: releasedTask.title,
    assigneeId: null,
    type: "status_changed",
  });

  return releasedTask;
}
export default releaseTask;

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

  const [pausedTask] = await db
    .update(taskTable)
    .set({
      status: "paused",
      pausedReason: reasonTrimmed,
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
    type: "paused",
  });

  return pausedTask;
}export default pauseTask;

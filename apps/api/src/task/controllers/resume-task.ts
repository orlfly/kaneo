import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { assertTaskOwnership } from "./assert-task-ownership";

export async function resumeTask({
  taskId,
  currentUserId,
}: {
  taskId: string;
  currentUserId: string;
}) {
  await assertTaskOwnership(taskId, currentUserId);

  const [resumedTask] = await db
    .update(taskTable)
    .set({
      status: "in-progress",
      pausedReason: null,
    })
    .where(eq(taskTable.id, taskId))
    .returning();

  if (!resumedTask) {
    throw new HTTPException(500, {
      message: "Failed to resume task",
    });
  }

  await publishEvent("task.status_changed", {
    taskId: resumedTask.id,
    projectId: resumedTask.projectId,
    userId: currentUserId,
    oldStatus: "paused",
    newStatus: "in-progress",
    title: resumedTask.title,
    assigneeId: resumedTask.userId,
    type: "status_changed",
  });

  return resumedTask;
}export default resumeTask;

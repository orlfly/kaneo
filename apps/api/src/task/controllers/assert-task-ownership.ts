import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";

/**
 * Guard: verifies that the current user owns the task (is its assignee) and
 * that the task is in a state an agent may operate on. Used by pause/resume/
 * release and any endpoint where an agent must prove it still holds the task
 * before mutating it.
 */
export async function assertTaskOwnership(
  taskId: string,
  currentUserId: string,
): Promise<void> {
  const task = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  if (task.userId !== currentUserId) {
    throw new HTTPException(403, {
      message: "Task not claimed by you",
    });
  }
}

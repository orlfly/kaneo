import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, userTable } from "../../database/schema";
import { publishEvent } from "../../events";

async function updateTaskAssignee({
  id,
  userId,
  currentUserId,
}: {
  id: string;
  userId: string | null;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  const nextAssigneeId = userId || null;
  if (existingTask.userId === nextAssigneeId) {
    return existingTask;
  }

  // Guard: assignment requires the task to be unassigned. An already-claimed
  // or already-assigned task must be released first to avoid clobbering
  // concurrent agent claims via the non-atomic assignee endpoint.
  if (nextAssigneeId && existingTask.userId !== null) {
    throw new HTTPException(409, {
      message: "Task already assigned. Release it first.",
    });
  }

  // Unassigning (userId=null) is always allowed — a manager can release.
  // Assigning (userId!=null) requires the task to be unassigned.
  const whereClause =
    nextAssigneeId !== null
      ? and(eq(taskTable.id, id), isNull(taskTable.userId))
      : eq(taskTable.id, id);

  const [updatedTask] = await db
    .update(taskTable)
    .set({ userId: nextAssigneeId || null })
    .where(whereClause)
    .returning();

  if (!updatedTask) {
    throw new HTTPException(409, {
      message: "Task already assigned. Release it first.",
    });
  }

  const newAssigneeName = userId
    ? (
        await db
          .select({ name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, userId))
          .limit(1)
      )[0]?.name
    : undefined;

  if (!userId) {
    await publishEvent("task.unassigned", {
      taskId: updatedTask.id,
      projectId: updatedTask.projectId,
      userId: currentUserId,
      title: updatedTask.title,
      type: "unassigned",
    });

    return updatedTask;
  }

  await publishEvent("task.assignee_changed", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    userId: currentUserId,
    oldAssignee: existingTask.userId,
    newAssignee: newAssigneeName,
    newAssigneeId: userId,
    title: updatedTask.title,
    type: "assignee_changed",
  });

  return updatedTask;
}

export default updateTaskAssignee;

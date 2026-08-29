import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { deleteOrphanedAssets } from "../../storage/cleanup-assets";
import { assertValidTaskStatus } from "../validate-task-fields";

// Once a task is actively being worked on or under review, the role contract
// with the current worker is fixed: changing requiredRole at that stage would
// silently invalidate the claim and confuse integrations that rely on the
// role (e.g. claim-next filters). Only to-do tasks remain editable.
const LOCKED_STATUSES = new Set(["in-progress", "in-review"]);

async function updateTask(
  id: string,
  title: string,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  projectId: string,
  description: string,
  priority: string,
  position: number,
  userId?: string,
  currentUserId?: string,
  requiredRole?: string | null,
) {
  const [existingTask] = await db
    .select({
      id: taskTable.id,
      description: taskTable.description,
      status: taskTable.status,
      projectId: taskTable.projectId,
      requiredRole: taskTable.requiredRole,
    })
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (projectId !== existingTask.projectId) {
    throw new HTTPException(400, {
      message: "Use the task move endpoint to move tasks between projects",
    });
  }

  await assertValidTaskStatus(status, projectId);

  // Reject requiredRole changes once the task is locked to an active worker.
  // requiredRole is the only field on which the worker contract depends at
  // runtime, so we allow the status/assignee/priority to keep moving while
  // the role remains pinned.
  const nextRequiredRole = requiredRole ?? null;
  const roleChanged = nextRequiredRole !== existingTask.requiredRole;
  if (roleChanged && LOCKED_STATUSES.has(existingTask.status)) {
    throw new HTTPException(409, {
      message:
        "Cannot change requiredRole while the task is in-progress or in-review",
    });
  }

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, status),
    ),
  });

  const [updatedTask] = await db
    .update(taskTable)
    .set({
      title,
      status,
      columnId: column?.id ?? null,
      startDate: startDate || null,
      dueDate: dueDate || null,
      projectId,
      description,
      priority,
      position,
      userId: userId || null,
      requiredRole: requiredRole ?? null,
    })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task",
    });
  }

  if (existingTask.status !== status) {
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
  }

  await publishEvent("task.updated", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    title: updatedTask.title,
    status: updatedTask.status,
    userId: currentUserId,
  });

  if (existingTask.description !== description) {
    deleteOrphanedAssets(existingTask.description, description, {
      taskId: id,
    }).catch(() => {});
  }

  return updatedTask;
}

export default updateTask;

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
}: {
  id: string;
  status: string;
  currentUserId: string;
  agentRole?: AgentRole;
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

  // When an agent changes status, keep the task's requiredRole aligned with
  // the stage it is entering:
  //   in-progress -> the agent's own role
  //   in-review   -> code-review (the reviewer)
  //   done        -> null (completed, no longer needs a role)
  // Other statuses leave requiredRole untouched.
  let nextRequiredRole = existingTask.requiredRole;
  if (agentRole !== undefined) {
    if (status === "in-progress") {
      nextRequiredRole = agentRole;
    } else if (status === "in-review") {
      nextRequiredRole = "code-review";
    } else if (status === "done") {
      nextRequiredRole = null;
    }
  }

  const [updatedTask] = await db
    .update(taskTable)
    .set({
      status,
      columnId: column?.id ?? null,
      requiredRole: nextRequiredRole,
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

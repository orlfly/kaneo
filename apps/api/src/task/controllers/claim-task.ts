import { and, eq, isNull } from "drizzle-orm";
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
 * userId IS NULL guard ensures only one concurrent caller wins.
 */
export async function claimTask({
  taskId,
  userId,
  agentKeyId,
}: {
  taskId: string;
  userId: string;
  agentKeyId?: string;
}): Promise<ClaimResult> {
  const now = new Date();

  const [claimed] = await db
    .update(schema.taskTable)
    .set({
      userId,
      claimedBy: agentKeyId ?? null,
      claimedAt: now,
      status: "in-progress",
    })
    .where(
      and(
        eq(schema.taskTable.id, taskId),
        isNull(schema.taskTable.userId),
        eq(schema.taskTable.status, "to-do"),
      ),
    )
    .returning();

  if (!claimed) {
    throw new HTTPException(409, {
      message:
        "Task is not available for claiming (already assigned or not in to-do status)",
    });
  }

  // Audit trail: record who claimed via which API key.
  await db.insert(schema.activityTable).values({
    taskId: claimed.id,
    type: "claimed",
    userId,
    agentKeyId: agentKeyId ?? null,
    content: null,
    eventData: { agentKeyId: agentKeyId ?? null },
  });

  await publishEvent("task.claimed", {
    taskId: claimed.id,
    projectId: claimed.projectId,
    userId,
    title: claimed.title,
    type: "claimed",
  });

  // Also emit status_changed so integrations/realtime update.
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

  return {
    taskId: claimed.id,
    title: claimed.title,
    status: claimed.status,
    claimed: true,
  };
}
export default claimTask;

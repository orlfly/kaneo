import type { AgentRole } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { listOpenBlockers } from "../../task-relation/blockers";
import { assertTaskOwnership } from "./assert-task-ownership";

export async function resumeTask({
  taskId,
  currentUserId,
  agentRole,
}: {
  taskId: string;
  currentUserId: string;
  agentRole?: AgentRole;
}) {
  await assertTaskOwnership(taskId, currentUserId);

  // An agent resume must respect the same dependency gate as claim: handing a
  // blocked task back to an agent only produces another pause. Humans may
  // override the gate explicitly, for example when a blocker is obsolete.
  if (agentRole !== undefined) {
    const openBlockers = await listOpenBlockers(taskId);
    if (openBlockers.length > 0) {
      throw new HTTPException(409, {
        message: `Task is blocked by ${openBlockers
          .map((blocker) =>
            blocker.number === null
              ? blocker.title
              : `#${blocker.number} ${blocker.title}`,
          )
          .join(", ")}`,
      });
    }
  }

  const [resumedTask] = await db
    .update(taskTable)
    .set({
      status: "in-progress",
      pausedReason: null,
      reviewClaimedBy: null,
      reviewClaimedAt: null,
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
}
export default resumeTask;

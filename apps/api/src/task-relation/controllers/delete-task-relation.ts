import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";

async function deleteTaskRelation(id: string, userId: string, teamId: string) {
  // Check both endpoints in the delete statement itself. Legacy cross-tenant
  // rows must not bypass the same boundary enforced on creation and reads.
  const teamTasks = db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(projectTable.teamId, teamId));

  const [relation] = await db
    .delete(taskRelationTable)
    .where(
      and(
        eq(taskRelationTable.id, id),
        inArray(taskRelationTable.sourceTaskId, teamTasks),
        inArray(taskRelationTable.targetTaskId, teamTasks),
      ),
    )
    .returning();

  if (!relation) {
    throw new HTTPException(404, {
      message: "Task relation not found",
    });
  }

  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(taskTable.id, relation.sourceTaskId),
        eq(projectTable.teamId, teamId),
      ),
    )
    .limit(1);

  if (task) {
    await publishEvent("task-relation.deleted", {
      ...relation,
      taskId: relation.sourceTaskId,
      sourceTaskId: relation.sourceTaskId,
      targetTaskId: relation.targetTaskId,
      projectId: task.projectId,
      userId,
    });
  }

  return relation;
}

export default deleteTaskRelation;

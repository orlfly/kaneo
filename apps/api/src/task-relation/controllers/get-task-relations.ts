import { eq, or } from "drizzle-orm";
import db from "../../database";
import { taskRelationTable } from "../../database/schema";
import {
  hydrateTaskRelations,
  taskRelationColumns,
} from "./hydrate-task-relations";

async function getTaskRelations(taskId: string, teamId: string) {
  const relations = await db
    .select(taskRelationColumns)
    .from(taskRelationTable)
    .where(
      or(
        eq(taskRelationTable.sourceTaskId, taskId),
        eq(taskRelationTable.targetTaskId, taskId),
      ),
    );

  return hydrateTaskRelations(relations, teamId);
}

export default getTaskRelations;

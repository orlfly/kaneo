import { eq, inArray, or } from "drizzle-orm";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import {
  hydrateTaskRelations,
  taskRelationColumns,
} from "./hydrate-task-relations";

/**
 * Every relation with an endpoint in the project, both endpoints hydrated.
 *
 * The Gantt loads a whole project at once, so fetching per task (one request
 * per bar) is not an option. Relations that point at a task in another project
 * of the same workspace are included: the caller decides whether it can draw
 * them, and hydration still enforces the team boundary.
 */
async function getProjectTaskRelations(projectId: string, teamId: string) {
  const projectTasks = db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId));

  const relations = await db
    .select(taskRelationColumns)
    .from(taskRelationTable)
    .where(
      or(
        inArray(taskRelationTable.sourceTaskId, projectTasks),
        inArray(taskRelationTable.targetTaskId, projectTasks),
      ),
    );

  return hydrateTaskRelations(relations, teamId);
}

export default getProjectTaskRelations;

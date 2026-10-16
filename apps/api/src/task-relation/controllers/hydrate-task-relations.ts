import { and, eq, inArray } from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskRelationTable,
  taskTable,
  userTable,
} from "../../database/schema";

export type TaskRelationRow = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
  createdAt: Date;
};

/**
 * Attaches the two endpoint tasks (title, status, priority, schedule, assignee)
 * to a set of relations, dropping any relation whose endpoints are not both
 * visible in `teamId`.
 *
 * The drop is deliberate: rows can predate the current tenant boundary, and a
 * relation that names a task the caller cannot open would leak its existence.
 */
export async function hydrateTaskRelations(
  relations: TaskRelationRow[],
  teamId: string,
) {
  const taskIds = new Set<string>();
  for (const relation of relations) {
    taskIds.add(relation.sourceTaskId);
    taskIds.add(relation.targetTaskId);
  }

  const tasks = new Map<
    string,
    {
      id: string;
      title: string;
      status: string;
      priority: string | null;
      number: number | null;
      projectId: string;
      userId: string | null;
      assigneeName: string | null;
    }
  >();

  if (taskIds.size > 0) {
    const taskRows = await db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        status: taskTable.status,
        priority: taskTable.priority,
        number: taskTable.number,
        projectId: taskTable.projectId,
        userId: taskTable.userId,
        assigneeName: userTable.name,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(userTable, eq(taskTable.userId, userTable.id))
      .where(
        and(
          inArray(taskTable.id, [...taskIds]),
          eq(projectTable.teamId, teamId),
        ),
      );

    for (const task of taskRows) {
      tasks.set(task.id, task);
    }
  }

  return relations
    .filter((rel) => tasks.has(rel.sourceTaskId) && tasks.has(rel.targetTaskId))
    .map((rel) => ({
      ...rel,
      sourceTask: tasks.get(rel.sourceTaskId) ?? null,
      targetTask: tasks.get(rel.targetTaskId) ?? null,
    }));
}

export const taskRelationColumns = {
  id: taskRelationTable.id,
  sourceTaskId: taskRelationTable.sourceTaskId,
  targetTaskId: taskRelationTable.targetTaskId,
  relationType: taskRelationTable.relationType,
  createdAt: taskRelationTable.createdAt,
};

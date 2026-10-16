import { and, eq, inArray, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import {
  projectTable,
  taskRelationTable,
  taskTable,
} from "../../database/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const TASK_RELATION_TYPES = ["subtask", "blocks", "related"] as const;
export type TaskRelationType = (typeof TASK_RELATION_TYPES)[number];

export type TaskRelationInput = {
  targetTaskId: string;
  relationType: TaskRelationType;
};

function isRelationType(value: string): value is TaskRelationType {
  return (TASK_RELATION_TYPES as readonly string[]).includes(value);
}

/**
 * Inserts relations from `sourceTaskId` to existing tasks inside an open
 * transaction.
 *
 * Callers that create the source task in the same transaction (POST
 * /api/task/{projectId}) use this so a rejected relation rolls the task back
 * with it: a task that silently loses the prerequisite it was created for is
 * worse than a failed request. Errors mirror the single-relation route so
 * clients see one vocabulary: a foreign and a nonexistent target are both a
 * bare 404, and a repeat of the same relation type is a 409.
 */
export async function insertTaskRelations(
  tx: Transaction,
  {
    sourceTaskId,
    teamId,
    relations,
  }: {
    sourceTaskId: string;
    teamId: string;
    relations: TaskRelationInput[];
  },
) {
  if (relations.length === 0) return [];

  const seen = new Set<string>();
  for (const relation of relations) {
    const targetTaskId = relation.targetTaskId.trim();
    if (!targetTaskId || !isRelationType(relation.relationType)) {
      throw new HTTPException(400, {
        message:
          "Each relation needs a targetTaskId and a relationType of 'subtask', 'blocks' or 'related'",
      });
    }
    if (targetTaskId === sourceTaskId) {
      throw new HTTPException(400, {
        message: "Cannot create a relation between a task and itself",
      });
    }
    const key = `${relation.relationType}:${targetTaskId}`;
    if (seen.has(key)) {
      throw new HTTPException(409, {
        message: "This relation already exists",
      });
    }
    seen.add(key);
  }

  const targetIds = [
    ...new Set(relations.map((rel) => rel.targetTaskId.trim())),
  ];

  const reachableTargets = await tx
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(inArray(taskTable.id, targetIds), eq(projectTable.teamId, teamId)),
    );

  const reachable = new Set(reachableTargets.map((row) => row.id));
  for (const targetTaskId of targetIds) {
    if (!reachable.has(targetTaskId)) {
      throw new HTTPException(404, { message: "Target task not found" });
    }
  }

  // Relation types are unique per task pair in either direction, matching the
  // single-relation route. A pair is keyed by the task on the other side.
  const existing = await tx
    .select({
      sourceTaskId: taskRelationTable.sourceTaskId,
      targetTaskId: taskRelationTable.targetTaskId,
      relationType: taskRelationTable.relationType,
    })
    .from(taskRelationTable)
    .where(
      or(
        eq(taskRelationTable.sourceTaskId, sourceTaskId),
        and(
          eq(taskRelationTable.targetTaskId, sourceTaskId),
          inArray(taskRelationTable.sourceTaskId, targetIds),
        ),
      ),
    );

  const taken = new Set(
    existing.map((row) => {
      const other =
        row.sourceTaskId === sourceTaskId ? row.targetTaskId : row.sourceTaskId;
      return `${row.relationType}:${other}`;
    }),
  );
  for (const relation of relations) {
    const key = `${relation.relationType}:${relation.targetTaskId.trim()}`;
    if (taken.has(key)) {
      throw new HTTPException(409, {
        message: "This relation already exists",
      });
    }
  }

  return tx
    .insert(taskRelationTable)
    .values(
      relations.map((relation) => ({
        sourceTaskId,
        targetTaskId: relation.targetTaskId.trim(),
        relationType: relation.relationType,
      })),
    )
    .returning();
}

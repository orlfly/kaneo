import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DependencyEndpoints = {
  dependentTaskId: string;
  prerequisiteTaskId: string;
};

const TASK_RELATION_LOCK_NAMESPACE = 1526;

/**
 * Translate a relation into the dependency edge it adds. `blocks` makes the
 * target wait for the source; `subtask` makes the parent wait for the child.
 * `related` is informational and never gates work.
 */
export function getDependencyEndpoints({
  sourceTaskId,
  targetTaskId,
  relationType,
}: {
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
}): DependencyEndpoints | null {
  if (relationType === "blocks") {
    return { dependentTaskId: targetTaskId, prerequisiteTaskId: sourceTaskId };
  }

  if (relationType === "subtask") {
    return { dependentTaskId: sourceTaskId, prerequisiteTaskId: targetTaskId };
  }

  return null;
}

/**
 * Serialize relation writes per workspace. Cycle detection reads the whole
 * dependency graph, so two concurrent creates could each miss the edge the
 * other is adding and close a cycle together without this lock.
 */
export async function lockTaskRelationGraph(
  dbOrTx: DbOrTx,
  teamId: string,
): Promise<void> {
  await dbOrTx.execute(
    sql`SELECT pg_advisory_xact_lock(${TASK_RELATION_LOCK_NAMESPACE}, hashtext(${teamId}))`,
  );
}

async function dependsTransitivelyOn(
  dbOrTx: DbOrTx,
  {
    teamId,
    taskId,
    dependencyTaskId,
  }: {
    teamId: string;
    taskId: string;
    dependencyTaskId: string;
  },
): Promise<boolean> {
  if (taskId === dependencyTaskId) return true;

  const result = await dbOrTx.execute(sql`
    WITH RECURSIVE team_relation AS (
      SELECT relation.source_task_id, relation.target_task_id, relation.relation_type
      FROM task_relation relation
      JOIN task source_task ON source_task.id = relation.source_task_id
      JOIN project source_project ON source_project.id = source_task.project_id
      JOIN task target_task ON target_task.id = relation.target_task_id
      JOIN project target_project ON target_project.id = target_task.project_id
      WHERE source_project.team_id = ${teamId}
        AND target_project.team_id = ${teamId}
        AND relation.relation_type IN ('blocks', 'subtask')
    ),
    dependencies AS (
      SELECT CASE
        WHEN relation.relation_type = 'blocks' THEN relation.source_task_id
        ELSE relation.target_task_id
      END AS task_id
      FROM team_relation relation
      WHERE (
        relation.relation_type = 'blocks'
        AND relation.target_task_id = ${taskId}
      ) OR (
        relation.relation_type = 'subtask'
        AND relation.source_task_id = ${taskId}
      )

      UNION

      SELECT CASE
        WHEN relation.relation_type = 'blocks' THEN relation.source_task_id
        ELSE relation.target_task_id
      END AS task_id
      FROM team_relation relation
      JOIN dependencies dependency
        ON (
          relation.relation_type = 'blocks'
          AND relation.target_task_id = dependency.task_id
        ) OR (
          relation.relation_type = 'subtask'
          AND relation.source_task_id = dependency.task_id
        )
    )
    SELECT 1 AS found
    FROM dependencies
    WHERE task_id = ${dependencyTaskId}
    LIMIT 1
  `);

  return result.rows.length > 0;
}

/**
 * Reject a relation that would close a dependency cycle.
 *
 * `blocks` and `subtask` share one graph because both gate work: a task waits
 * for the source of a `blocks` edge and for the children of a `subtask` edge.
 * Callers must hold `lockTaskRelationGraph` around the check and the insert.
 */
export async function assertNoDependencyCycle(
  dbOrTx: DbOrTx,
  {
    teamId,
    sourceTaskId,
    targetTaskId,
    relationType,
  }: {
    teamId: string;
    sourceTaskId: string;
    targetTaskId: string;
    relationType: string;
  },
): Promise<void> {
  const endpoints = getDependencyEndpoints({
    sourceTaskId,
    targetTaskId,
    relationType,
  });

  if (!endpoints) return;

  // The new edge makes `dependentTaskId` wait for `prerequisiteTaskId`, so it
  // is only safe while the prerequisite does not already wait on the dependent.
  const closesCycle = await dependsTransitivelyOn(dbOrTx, {
    teamId,
    taskId: endpoints.prerequisiteTaskId,
    dependencyTaskId: endpoints.dependentTaskId,
  });

  if (closesCycle) {
    throw new HTTPException(409, {
      message: "This relation would create a circular dependency",
    });
  }
}

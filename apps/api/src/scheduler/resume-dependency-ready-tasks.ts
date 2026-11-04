import { and, eq, sql } from "drizzle-orm";
import db from "../database";
import { taskTable } from "../database/schema";
import { publishEvent } from "../events";
import { isFinalTaskSql } from "../task-relation/blockers";

/**
 * Resume tasks paused on a declared dependency once every dependency is final.
 *
 * The observed failure mode: an agent pauses a task "waiting for #396/#397/#398",
 * the subtasks finish, and the parent stays paused indefinitely because nothing
 * re-checks the relation. This job only touches paused tasks that actually have
 * a `blocks` prerequisite or a `subtask` child, so a task paused for external
 * credentials or a decision is never auto-started.
 */
export async function resumeDependencyReadyTasks(): Promise<{
  resumed: number;
}> {
  const ready = await db.execute(sql`
    SELECT t.id, t.number, t.title, t.project_id
    FROM task t
    WHERE t.status = 'paused'
      AND t.paused_reason IS NOT NULL
      AND trim(t.paused_reason) <> ''
      AND (
        EXISTS (
          SELECT 1 FROM task_relation blocked_relation
          WHERE blocked_relation.target_task_id = t.id
            AND blocked_relation.relation_type = 'blocks'
        )
        OR EXISTS (
          SELECT 1 FROM task_relation parent_relation
          WHERE parent_relation.source_task_id = t.id
            AND parent_relation.relation_type = 'subtask'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM task_relation dependency_relation
        JOIN task dependency ON dependency.id = CASE
          WHEN dependency_relation.relation_type = 'blocks'
            AND dependency_relation.target_task_id = t.id
            THEN dependency_relation.source_task_id
          WHEN dependency_relation.relation_type = 'subtask'
            AND dependency_relation.source_task_id = t.id
            THEN dependency_relation.target_task_id
        END
        WHERE (
          (
            dependency_relation.relation_type = 'blocks'
            AND dependency_relation.target_task_id = t.id
          )
          OR (
            dependency_relation.relation_type = 'subtask'
            AND dependency_relation.source_task_id = t.id
          )
        )
        AND NOT ${isFinalTaskSql(sql`dependency`)}
      )
  `);

  const rows = ready.rows as Array<{
    id: string;
    number: number | null;
    title: string;
    project_id: string;
  }>;

  let resumed = 0;
  for (const row of rows) {
    const [updated] = await db
      .update(taskTable)
      .set({
        status: "to-do",
        userId: null,
        claimedBy: null,
        claimedAt: null,
        pausedReason: null,
        reviewClaimedBy: null,
        reviewClaimedAt: null,
      })
      .where(and(eq(taskTable.id, row.id), eq(taskTable.status, "paused")))
      .returning();

    if (!updated) {
      continue;
    }

    resumed += 1;
    await publishEvent("task.status_changed", {
      taskId: updated.id,
      projectId: updated.projectId,
      // System-initiated: no human or agent actor.
      userId: null,
      oldStatus: "paused",
      newStatus: "to-do",
      title: updated.title,
      assigneeId: null,
      reason: "All declared dependencies are complete",
      type: "status_changed",
    });
    await publishEvent("task-relation.refresh", {
      projectId: updated.projectId,
      userId: null,
    });
  }

  return { resumed };
}

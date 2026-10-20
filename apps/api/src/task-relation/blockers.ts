import { sql } from "drizzle-orm";

import db from "../database";
import { taskRelationTable, taskTable } from "../database/schema";

/**
 * A `blocks` relation keeps its target out of the scheduler until the blocker
 * finishes. "Finished" means the blocker sits in a final column, or was
 * archived: an abandoned blocker must not strand the task behind it forever.
 */
function openBlockerSql(blocker: ReturnType<typeof sql>) {
  return sql`NOT (
    ${blocker}.status = 'archived'
    OR EXISTS (
      SELECT 1 FROM "column" blocked_by_column
      WHERE blocked_by_column.project_id = ${blocker}.project_id
        AND blocked_by_column.slug = ${blocker}.status
        AND blocked_by_column.is_final = true
    )
  )`;
}

/**
 * SQL predicate over a `task` row of the surrounding query: true when an open
 * `blocks` relation points at it. Used by the claim queries so filtering costs
 * no extra round trip per candidate.
 */
export function hasOpenBlocker(taskIdColumn: ReturnType<typeof sql>) {
  return sql`EXISTS (
    SELECT 1 FROM ${taskRelationTable} open_blocking_relation
    JOIN ${taskTable} open_blocker
      ON open_blocker.id = open_blocking_relation.source_task_id
    WHERE open_blocking_relation.target_task_id = ${taskIdColumn}
      AND open_blocking_relation.relation_type = 'blocks'
      AND ${openBlockerSql(sql`open_blocker`)}
  )`;
}

export type OpenBlocker = {
  id: string;
  number: number | null;
  title: string;
  status: string;
};

/** The tasks currently blocking `taskId`, oldest ticket first. */
export async function listOpenBlockers(taskId: string): Promise<OpenBlocker[]> {
  const result = await db.execute(sql`
    SELECT blocker.id, blocker.number, blocker.title, blocker.status
    FROM ${taskRelationTable} blocking_relation
    JOIN ${taskTable} blocker ON blocker.id = blocking_relation.source_task_id
    WHERE blocking_relation.target_task_id = ${taskId}
      AND blocking_relation.relation_type = 'blocks'
      AND ${openBlockerSql(sql`blocker`)}
    ORDER BY blocker.number ASC
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    number: row.number === null ? null : Number(row.number),
    title: String(row.title),
    status: String(row.status),
  }));
}

/** Convenience for single-task checks (claim, move, status change). */
export async function isTaskBlocked(taskId: string): Promise<boolean> {
  return (await listOpenBlockers(taskId)).length > 0;
}

/** The tasks this task blocks while it is open, i.e. what finishing unblocks. */
export async function listTasksBlockedBy(
  taskId: string,
): Promise<OpenBlocker[]> {
  const result = await db.execute(sql`
    SELECT blocked.id, blocked.number, blocked.title, blocked.status
    FROM ${taskRelationTable} blocking_relation
    JOIN ${taskTable} blocked ON blocked.id = blocking_relation.target_task_id
    WHERE blocking_relation.source_task_id = ${taskId}
      AND blocking_relation.relation_type = 'blocks'
    ORDER BY blocked.number ASC
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    number: row.number === null ? null : Number(row.number),
    title: String(row.title),
    status: String(row.status),
  }));
}

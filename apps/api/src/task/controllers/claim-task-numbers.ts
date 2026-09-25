import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Claim a contiguous range of task numbers for a project.
 *
 * Concurrency model:
 *  1. Acquire a row lock on the project (SELECT ... FOR UPDATE) so concurrent
 *     claims serialize on the same project. This blocks new claims but does
 *     NOT block reads of the task table.
 *  2. Read MAX(task.number) inside the locked window. This guards against
 *     counter lag from external bulk imports (e.g. ad-hoc psql inserts, gitea
 *     plugin pre-counter-sync paths). The MAX query is the source of truth for
 *     "what numbers are already taken".
 *  3. Compute safeNext = MAX(counter + count, maxExisting + count) and bump
 *     the counter to safeNext. Returning safeNext - count + 1 means callers
 *     get a number that is guaranteed to be free of (projectId, number)
 *     collisions at the moment of claim.
 *
 * The function always runs in its own transaction (or savepoint if the caller
 * already passed a tx). This keeps the read-lock-update-claim atomic regardless
 * of how it's invoked from the API layer.
 */
async function claimTaskNumbers(
  projectId: string,
  count: number,
  dbOrTx: DbOrTx = db,
) {
  if (count <= 0) {
    throw new HTTPException(400, { message: "count must be positive" });
  }

  return dbOrTx.transaction(async (tx) => {
    // 1. Lock the project row so concurrent claims serialize.
    const [project] = await tx
      .select({ lastTaskNumber: projectTable.lastTaskNumber })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .for("update");

    if (!project) {
      throw new HTTPException(404, {
        message: "Project not found",
      });
    }

    // 2. Read MAX(task.number) inside the locked window. This is the canonical
    //    "what numbers are taken" view, immune to counter drift.
    const [maxResult] = await tx
      .select({
        maxNumber: sql<number>`COALESCE(MAX(${taskTable.number}), 0)`,
      })
      .from(taskTable)
      .where(eq(taskTable.projectId, projectId));

    const maxExisting = Number(maxResult?.maxNumber ?? 0);
    const current = project.lastTaskNumber ?? 0;
    // 3. Skip forward if counter is behind. safeNext is at least counter+count
    //    and at least maxExisting+count, so the returned window cannot collide.
    const safeNext = Math.max(current + count, maxExisting + count);

    if (safeNext > current) {
      await tx
        .update(projectTable)
        .set({ lastTaskNumber: safeNext })
        .where(eq(projectTable.id, projectId));
    }

    return safeNext - count + 1;
  });
}

export async function claimTaskNumber(projectId: string, dbOrTx: DbOrTx = db) {
  return claimTaskNumbers(projectId, 1, dbOrTx);
}

export default claimTaskNumbers;

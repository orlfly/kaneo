import { HTTPException } from "hono/http-exception";

/**
 * Postgres SQLSTATE for unique_violation. The pg driver surfaces this on the
 * thrown error as `err.code === "23505"`. Drizzle wraps the driver error in
 * DrizzleQueryError, so we look at `err.cause?.code` first and fall back to
 * `err.code` for non-Drizzle paths (e.g. raw pool.query).
 */
const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return (
    e.code === PG_UNIQUE_VIOLATION || e.cause?.code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Detect the (projectId, number) unique-constraint name on the task table
 * (see schema.ts: `task_project_number_unique`). Used to disambiguate a
 * counter-collision from a different unique violation in the same insert.
 */
export function isTaskNumberConflict(err: unknown): boolean {
  if (!isUniqueViolation(err)) return false;
  const e = err as { constraint?: string; cause?: { constraint?: string } };
  const constraint = e.constraint ?? e.cause?.constraint;
  return constraint === "task_project_number_unique";
}

const DEFAULT_MAX_ATTEMPTS = 8;

/**
 * Run `op` until it succeeds or a non-(taskNumber) error is thrown. Used to
 * absorb the rare (projectId, number) collision that can still occur when an
 * external writer (e.g. ad-hoc psql, gitea plugin pre-counter-sync) inserted
 * a row between our counter claim and the insert. After the safe budget is
 * exhausted, we surface a 409 so callers can diagnose counter drift instead
 * of seeing a generic 500.
 *
 * `getAttemptNumber` is called only on a retry, so the caller can include the
 * last-claimed number in a log line (or just the attempt index).
 */
export async function withTaskNumberRetry<T>(
  op: () => Promise<T>,
  opts: {
    maxAttempts?: number;
    projectId: string;
    onRetry?: (attempt: number) => void;
  },
): Promise<T> {
  const max = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (!isTaskNumberConflict(err)) throw err;
      if (opts.onRetry) opts.onRetry(attempt);
    }
  }
  throw new HTTPException(409, {
    message: `Failed to claim unique task number after ${max} retries (project=${opts.projectId})`,
  });
}

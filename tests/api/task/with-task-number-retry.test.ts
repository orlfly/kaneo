import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import {
  isTaskNumberConflict,
  isUniqueViolation,
  withTaskNumberRetry,
} from "../../../apps/api/src/task/controllers/with-task-number-retry";

function makeUniqueViolation(
  constraint: string,
  code: "23505" | string = "23505",
): Error & { code: string; constraint: string } {
  const e = new Error(
    `duplicate key value violates unique constraint "${constraint}"`,
  ) as Error & { code: string; constraint: string };
  e.code = code;
  e.constraint = constraint;
  return e;
}

describe("isUniqueViolation", () => {
  it("returns true for direct pg unique_violation", () => {
    expect(isUniqueViolation(makeUniqueViolation("any"))).toBe(true);
  });

  it("returns true when nested under DrizzleQueryError cause", () => {
    const cause = makeUniqueViolation("any");
    const wrapped = new Error("Failed query") as Error & {
      cause: typeof cause;
    };
    wrapped.cause = cause;
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("returns false for non-23505 errors", () => {
    const e = new Error("other") as Error & { code: string };
    e.code = "42P01";
    expect(isUniqueViolation(e)).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("string")).toBe(false);
    expect(isUniqueViolation(42)).toBe(false);
  });
});

describe("isTaskNumberConflict", () => {
  it("returns true for task_project_number_unique", () => {
    expect(
      isTaskNumberConflict(makeUniqueViolation("task_project_number_unique")),
    ).toBe(true);
  });

  it("returns false for other unique constraints", () => {
    expect(isTaskNumberConflict(makeUniqueViolation("user_email_unique"))).toBe(
      false,
    );
  });

  it("returns false for non-unique errors", () => {
    expect(isTaskNumberConflict(new Error("boom"))).toBe(false);
  });
});

describe("withTaskNumberRetry", () => {
  it("returns the op result on the first successful attempt", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    const result = await withTaskNumberRetry(op, { projectId: "p-1" });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries on task_project_number_unique until success", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(makeUniqueViolation("task_project_number_unique"))
      .mockRejectedValueOnce(makeUniqueViolation("task_project_number_unique"))
      .mockResolvedValue("ok");

    const onRetry = vi.fn();
    const result = await withTaskNumberRetry(op, {
      projectId: "p-1",
      onRetry,
    });

    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2);
  });

  it("surfaces 409 after exhausting max attempts", async () => {
    const conflict = makeUniqueViolation("task_project_number_unique");
    const op = vi.fn().mockRejectedValue(conflict);

    await expect(
      withTaskNumberRetry(op, { projectId: "p-1", maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(HTTPException);

    expect(op).toHaveBeenCalledTimes(3);
  });

  it("propagates non-task-number errors immediately", async () => {
    const boom = new Error("boom");
    const op = vi.fn().mockRejectedValue(boom);

    await expect(withTaskNumberRetry(op, { projectId: "p-1" })).rejects.toBe(
      boom,
    );
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("does not retry other unique constraints", async () => {
    const otherUnique = makeUniqueViolation("user_email_unique");
    const op = vi.fn().mockRejectedValue(otherUnique);

    await expect(withTaskNumberRetry(op, { projectId: "p-1" })).rejects.toBe(
      otherUnique,
    );
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries when the violation is wrapped under DrizzleQueryError.cause", async () => {
    const cause = makeUniqueViolation("task_project_number_unique");
    const wrapped = new Error("Failed query") as Error & {
      cause: typeof cause;
    };
    wrapped.cause = cause;
    const op = vi.fn().mockRejectedValueOnce(wrapped).mockResolvedValue("ok");

    const result = await withTaskNumberRetry(op, { projectId: "p-1" });

    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("../../../apps/api/src/database", () => {
  // Minimal awaitable fluent stub for db.select(...).from(...).where(...) —
  // Drizzle's builder is thenable, so a plain thenable wrapper keeps the
  // controller code paths awaitable without the real database.
  const makeBuilder = () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      groupBy: () => chain,
      // biome-ignore lint/suspicious/noThenProperty: the stub intentionally mirrors Drizzle's thenable query builder so controller call sites can be awaited.
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        mocks.select().then(resolve, reject),
    };
    return chain;
  };
  return {
    default: { select: (..._args: unknown[]) => makeBuilder() },
    schema: {},
  };
});

import { getProjectContext } from "../../../apps/api/src/agent/controllers/get-project-context";

beforeEach(() => {
  mocks.select.mockReset();
});

describe("getProjectContext", () => {
  it("404s when the project does not exist", async () => {
    mocks.select.mockResolvedValue([]);
    await expect(
      getProjectContext({ projectId: "missing" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

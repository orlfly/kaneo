import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkPausedTaskSuggestions } from "../../../apps/api/src/scheduler/paused-task-suggestions";

const mocks = vi.hoisted(() => {
  return {
    chatCompletion: vi.fn(),
    isPiAgentConfigured: vi.fn(async () => true),
    insertedActivities: [] as Array<Record<string, unknown>>,
    db: {
      select: vi.fn(),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          mocks.insertedActivities.push(values);
          return [{ id: "activity-1" }];
        },
      }),
    } as unknown as { select: ReturnType<typeof vi.fn> },
  };
});

vi.mock("../../../apps/api/src/database", () => ({
  default: mocks.db,
  schema: {
    activityTable: {
      taskId: "col:activity.taskId",
      type: "col:activity.type",
      createdAt: "col:activity.createdAt",
    },
  },
}));

vi.mock("../../../apps/api/src/chat/pi-agent-client", () => ({
  chatCompletion: (...args: unknown[]) => mocks.chatCompletion(...args),
  isPiAgentConfigured: mocks.isPiAgentConfigured,
}));

const pausedTask = {
  id: "task-1",
  title: "Stuck task",
  number: 1,
  pausedReason: "waiting on upstream",
  priority: "high",
  projectId: "project-1",
  userId: "user-1",
};

function makeChain(terminal: "where" | "limit", rows: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const step of ["from", "where", "orderBy", "limit"]) {
    chain[step] = vi.fn(() => chain);
  }
  chain[terminal].mockResolvedValue(rows);
  return chain;
}

/**
 * The job runs two select shapes per task: the paused-task list (terminal
 * .where) and the latest-agent_suggestion lookup (terminal .limit). Dispatch
 * on call order: first select is the task list, the rest are dedup lookups.
 */
function mockSelects(
  taskListRows: unknown[],
  dedupRows: unknown[] | Error,
  failDedup = false,
) {
  let selectCall = 0;
  mocks.db.select = vi.fn(() => {
    selectCall += 1;
    if (selectCall === 1) {
      return makeChain("where", taskListRows);
    }
    const chain = makeChain(
      "limit",
      dedupRows instanceof Error ? [] : dedupRows,
    );
    if (failDedup || dedupRows instanceof Error) {
      chain.limit.mockRejectedValue(
        dedupRows instanceof Error ? dedupRows : new Error("db down"),
      );
    }
    return chain;
  });
}

describe("checkPausedTaskSuggestions dedup", () => {
  beforeEach(() => {
    mocks.insertedActivities.length = 0;
    mocks.chatCompletion.mockReset();
    mocks.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: "Try reassigning." } }],
    });
  });

  it("skips the LLM call when a suggestion exists within 24h", async () => {
    mockSelects(
      [pausedTask],
      [{ createdAt: new Date(Date.now() - 60 * 60 * 1000) }],
    );

    const result = await checkPausedTaskSuggestions();

    expect(result).toEqual({ degraded: false });
    expect(mocks.chatCompletion).not.toHaveBeenCalled();
    expect(mocks.insertedActivities).toHaveLength(0);
  });

  it("regenerates when the latest suggestion is older than 24h", async () => {
    mockSelects(
      [pausedTask],
      [{ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }],
    );

    const result = await checkPausedTaskSuggestions();

    expect(result).toEqual({ degraded: false });
    expect(mocks.chatCompletion).toHaveBeenCalledTimes(1);
    expect(mocks.insertedActivities).toHaveLength(1);
    expect(mocks.insertedActivities[0]).toMatchObject({
      taskId: "task-1",
      type: "agent_suggestion",
    });
  });

  it("generates when no prior suggestion exists", async () => {
    mockSelects([pausedTask], []);

    const result = await checkPausedTaskSuggestions();

    expect(result).toEqual({ degraded: false });
    expect(mocks.chatCompletion).toHaveBeenCalledTimes(1);
    expect(mocks.insertedActivities).toHaveLength(1);
  });

  it("returns degraded without calling the LLM when the dedup lookup fails", async () => {
    mockSelects([pausedTask], [], true);

    const result = await checkPausedTaskSuggestions();

    expect(result).toEqual({ degraded: true });
    expect(mocks.chatCompletion).not.toHaveBeenCalled();
    expect(mocks.insertedActivities).toHaveLength(0);
  });
});

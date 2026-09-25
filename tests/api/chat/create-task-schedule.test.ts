import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectSelect: vi.fn(),
  createTask: vi.fn(),
  createTaskRelation: vi.fn(),
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mocks.projectSelect(),
        }),
      }),
    }),
  },
}));

vi.mock("../../../apps/api/src/task/controllers/create-task", () => ({
  default: (...args: unknown[]) => mocks.createTask(...args),
}));

vi.mock(
  "../../../apps/api/src/task-relation/controllers/create-task-relation",
  () => ({
    default: (...args: unknown[]) => mocks.createTaskRelation(...args),
  }),
);

const { executeTool, toolDefinitions } = await import(
  "../../../apps/api/src/chat/tools"
);

const PROJECT_ID = "p1";
const USER_ID = "u1";

beforeEach(() => {
  mocks.projectSelect.mockReset();
  mocks.createTask.mockReset();
  mocks.createTaskRelation.mockReset();
  mocks.projectSelect.mockResolvedValue([{ teamId: "team1" }]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("create_task scheduling", () => {
  it("exposes startDate and dueDate parameters in the tool definition", () => {
    const createTaskTool = toolDefinitions.find(
      (tool) => tool.function.name === "create_task",
    );
    expect(createTaskTool).toBeDefined();

    const properties = createTaskTool?.function.parameters
      ?.properties as Record<string, unknown>;
    expect(properties.startDate).toBeDefined();
    expect(properties.dueDate).toBeDefined();
  });

  it("passes explicit startDate and dueDate to the controller", async () => {
    mocks.createTask.mockResolvedValue({
      id: "t1",
      title: "Write tests",
    });

    const result = await executeTool(
      "create_task",
      {
        title: "Write tests",
        startDate: "2026-09-03",
        dueDate: "2026-09-10",
      },
      PROJECT_ID,
      USER_ID,
    );

    const call = mocks.createTask.mock.calls[0][0] as {
      startDate: Date;
      dueDate: Date;
    };
    expect(call.startDate.toISOString()).toBe(
      new Date("2026-09-03").toISOString(),
    );
    expect(call.dueDate.toISOString()).toBe(
      new Date("2026-09-10").toISOString(),
    );
    expect(JSON.parse(result)).toMatchObject({ id: "t1", created: true });
  });

  it("defaults startDate to today and dueDate a few days out when omitted", async () => {
    mocks.createTask.mockResolvedValue({
      id: "t2",
      title: "Write docs",
    });

    await executeTool(
      "create_task",
      { title: "Write docs" },
      PROJECT_ID,
      USER_ID,
    );

    const call = mocks.createTask.mock.calls[0][0] as {
      startDate: Date;
      dueDate: Date;
    };
    const now = Date.now();
    // Both dates should be close to "today + 0d" and "today + 3d".
    expect(call.startDate.getTime()).toBeGreaterThan(now - 60_000);
    expect(call.startDate.getTime()).toBeLessThan(now + 60_000);
    const expectedDue = call.startDate.getTime() + 3 * 86_400_000;
    expect(call.dueDate.getTime()).toBe(expectedDue);
  });

  it("returns an error when startDate is after dueDate", async () => {
    const result = await executeTool(
      "create_task",
      {
        title: "Broken schedule",
        startDate: "2026-09-10",
        dueDate: "2026-09-03",
      },
      PROJECT_ID,
      USER_ID,
    );

    expect(JSON.parse(result)).toMatchObject({
      error: "startDate cannot be after dueDate",
    });
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("returns an error for an unparseable date instead of creating the task", async () => {
    const result = await executeTool(
      "create_task",
      {
        title: "Bad date",
        startDate: "not-a-date",
      },
      PROJECT_ID,
      USER_ID,
    );

    const parsed = JSON.parse(result) as { error?: string };
    expect(parsed.error).toContain("startDate");
    expect(mocks.createTask).not.toHaveBeenCalled();
  });
});

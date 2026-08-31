import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectSelect: vi.fn(),
  createTask: vi.fn(),
  createTaskRelation: vi.fn(),
  getTaskRelations: vi.fn(),
  deleteTaskRelation: vi.fn(),
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

vi.mock(
  "../../../apps/api/src/task-relation/controllers/get-task-relations",
  () => ({
    default: (...args: unknown[]) => mocks.getTaskRelations(...args),
  }),
);

vi.mock(
  "../../../apps/api/src/task-relation/controllers/delete-task-relation",
  () => ({
    default: (...args: unknown[]) => mocks.deleteTaskRelation(...args),
  }),
);

const { executeTool } = await import("../../../apps/api/src/chat/tools");

const PROJECT_ID = "p1";
const USER_ID = "u1";
const TEAM_ID = "team1";

beforeEach(() => {
  mocks.projectSelect.mockReset();
  mocks.createTask.mockReset();
  mocks.createTaskRelation.mockReset();
  mocks.getTaskRelations.mockReset();
  mocks.deleteTaskRelation.mockReset();
  mocks.projectSelect.mockResolvedValue([{ teamId: TEAM_ID }]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("create_task_relation tool", () => {
  it("creates a relation via the controller", async () => {
    mocks.createTaskRelation.mockResolvedValue({
      id: "rel1",
      sourceTaskId: "t1",
      targetTaskId: "t2",
      relationType: "blocks",
    });

    const result = await executeTool(
      "create_task_relation",
      { sourceTaskId: "t1", targetTaskId: "t2", relationType: "blocks" },
      PROJECT_ID,
      USER_ID,
    );

    expect(mocks.createTaskRelation).toHaveBeenCalledWith({
      sourceTaskId: "t1",
      targetTaskId: "t2",
      relationType: "blocks",
      userId: USER_ID,
      teamId: TEAM_ID,
    });
    expect(JSON.parse(result)).toMatchObject({
      id: "rel1",
      relationType: "blocks",
    });
  });

  it("returns an error when required args are missing", async () => {
    const result = await executeTool(
      "create_task_relation",
      { sourceTaskId: "t1" },
      PROJECT_ID,
      USER_ID,
    );
    expect(JSON.parse(result).error).toContain("required");
    expect(mocks.createTaskRelation).not.toHaveBeenCalled();
  });

  it("surfaces a controller error", async () => {
    mocks.createTaskRelation.mockRejectedValue(
      new Error("Cannot create a relation between a task and itself"),
    );
    const result = await executeTool(
      "create_task_relation",
      { sourceTaskId: "t1", targetTaskId: "t1", relationType: "related" },
      PROJECT_ID,
      USER_ID,
    );
    expect(JSON.parse(result).error).toContain("itself");
  });
});

describe("get_task_relations tool", () => {
  it("returns relations for a task", async () => {
    mocks.getTaskRelations.mockResolvedValue([
      {
        id: "rel1",
        sourceTaskId: "t1",
        targetTaskId: "t2",
        relationType: "blocks",
      },
    ]);

    const result = await executeTool(
      "get_task_relations",
      { taskId: "t1" },
      PROJECT_ID,
      USER_ID,
    );

    expect(mocks.getTaskRelations).toHaveBeenCalledWith("t1", TEAM_ID);
    expect(JSON.parse(result)).toHaveLength(1);
  });

  it("returns an error when taskId is missing", async () => {
    const result = await executeTool(
      "get_task_relations",
      {},
      PROJECT_ID,
      USER_ID,
    );
    expect(JSON.parse(result).error).toContain("taskId");
  });
});

describe("delete_task_relation tool", () => {
  it("deletes a relation by id", async () => {
    mocks.deleteTaskRelation.mockResolvedValue({ id: "rel1" });

    const result = await executeTool(
      "delete_task_relation",
      { id: "rel1" },
      PROJECT_ID,
      USER_ID,
    );

    expect(mocks.deleteTaskRelation).toHaveBeenCalledWith("rel1", USER_ID);
    expect(JSON.parse(result)).toMatchObject({ ok: true, id: "rel1" });
  });

  it("returns an error when id is missing", async () => {
    const result = await executeTool(
      "delete_task_relation",
      {},
      PROJECT_ID,
      USER_ID,
    );
    expect(JSON.parse(result).error).toContain("id");
  });
});

describe("create_task with dependencies", () => {
  it("creates the task and its declared relations", async () => {
    mocks.createTask.mockResolvedValue({ id: "new1", title: "New task" });
    mocks.createTaskRelation
      .mockResolvedValueOnce({ id: "rel1" })
      .mockResolvedValueOnce({ id: "rel2" });

    const result = await executeTool(
      "create_task",
      {
        title: "New task",
        dependencies: [
          { targetTaskId: "t1", relationType: "blocks" },
          { targetTaskId: "t2", relationType: "subtask" },
        ],
      },
      PROJECT_ID,
      USER_ID,
    );

    expect(mocks.createTask).toHaveBeenCalled();
    expect(mocks.createTaskRelation).toHaveBeenCalledTimes(2);
    expect(mocks.createTaskRelation).toHaveBeenNthCalledWith(1, {
      sourceTaskId: "new1",
      targetTaskId: "t1",
      relationType: "blocks",
      userId: USER_ID,
      teamId: TEAM_ID,
    });
    expect(mocks.createTaskRelation).toHaveBeenNthCalledWith(2, {
      sourceTaskId: "new1",
      targetTaskId: "t2",
      relationType: "subtask",
      userId: USER_ID,
      teamId: TEAM_ID,
    });
    expect(JSON.parse(result)).toMatchObject({
      id: "new1",
      created: true,
      dependencies: 2,
    });
  });

  it("rolls back created relations when a dependency fails", async () => {
    mocks.createTask.mockResolvedValue({ id: "new1", title: "New task" });
    mocks.createTaskRelation
      .mockResolvedValueOnce({ id: "rel1" })
      .mockRejectedValueOnce(new Error("Target task not found"));
    mocks.deleteTaskRelation.mockResolvedValue({ id: "rel1" });

    const result = await executeTool(
      "create_task",
      {
        title: "New task",
        dependencies: [
          { targetTaskId: "t1", relationType: "blocks" },
          { targetTaskId: "missing", relationType: "related" },
        ],
      },
      PROJECT_ID,
      USER_ID,
    );

    expect(JSON.parse(result).error).toContain("Target task not found");
    // The first relation must be rolled back.
    expect(mocks.deleteTaskRelation).toHaveBeenCalledWith("rel1", USER_ID);
  });

  it("creates a task without dependencies", async () => {
    mocks.createTask.mockResolvedValue({ id: "new1", title: "New task" });

    const result = await executeTool(
      "create_task",
      { title: "New task" },
      PROJECT_ID,
      USER_ID,
    );

    expect(mocks.createTaskRelation).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toMatchObject({
      id: "new1",
      created: true,
      dependencies: 0,
    });
  });
});

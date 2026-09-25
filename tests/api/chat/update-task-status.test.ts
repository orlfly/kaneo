import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  taskSelect: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mocks.taskSelect(),
        }),
      }),
    }),
  },
}));

vi.mock("../../../apps/api/src/task/controllers/update-task-status", () => ({
  default: (...args: unknown[]) => mocks.updateTaskStatus(...args),
}));

const { executeTool } = await import("../../../apps/api/src/chat/tools");

const PROJECT_ID = "p1";
const USER_ID = "u1";

beforeEach(() => {
  mocks.taskSelect.mockReset();
  mocks.updateTaskStatus.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("update_task_status tool", () => {
  it("updates a task to done when the user asks to complete it", async () => {
    mocks.taskSelect.mockResolvedValue([{ id: "t1", projectId: PROJECT_ID }]);
    mocks.updateTaskStatus.mockResolvedValue({
      id: "t1",
      title: "Implement login",
      status: "done",
    });

    const result = await executeTool(
      "update_task_status",
      { taskId: "t1", status: "done" },
      PROJECT_ID,
      USER_ID,
    );
    const parsed = JSON.parse(result);

    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe("done");
    expect(mocks.updateTaskStatus).toHaveBeenCalledWith({
      id: "t1",
      status: "done",
      currentUserId: USER_ID,
    });
  });

  it("updates a task to archived when the user asks to close it", async () => {
    mocks.taskSelect.mockResolvedValue([{ id: "t2", projectId: PROJECT_ID }]);
    mocks.updateTaskStatus.mockResolvedValue({
      id: "t2",
      title: "Deprecated page",
      status: "archived",
    });

    const result = await executeTool(
      "update_task_status",
      { taskId: "t2", status: "archived" },
      PROJECT_ID,
      USER_ID,
    );
    const parsed = JSON.parse(result);

    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe("archived");
  });

  it("rejects a task from a different project", async () => {
    mocks.taskSelect.mockResolvedValue([
      { id: "t3", projectId: "other-project" },
    ]);

    const result = await executeTool(
      "update_task_status",
      { taskId: "t3", status: "done" },
      PROJECT_ID,
      USER_ID,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("Task not found in this project");
    expect(mocks.updateTaskStatus).not.toHaveBeenCalled();
  });

  it("returns an error when the task is not found", async () => {
    mocks.taskSelect.mockResolvedValue([]);

    const result = await executeTool(
      "update_task_status",
      { taskId: "missing", status: "done" },
      PROJECT_ID,
      USER_ID,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("Task not found");
    expect(mocks.updateTaskStatus).not.toHaveBeenCalled();
  });

  it("surfaces an invalid status error from the controller", async () => {
    mocks.taskSelect.mockResolvedValue([{ id: "t1", projectId: PROJECT_ID }]);
    mocks.updateTaskStatus.mockRejectedValue(
      new Error('Invalid status "not-a-status"'),
    );

    const result = await executeTool(
      "update_task_status",
      { taskId: "t1", status: "not-a-status" },
      PROJECT_ID,
      USER_ID,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("not-a-status");
  });

  it("requires both taskId and status", async () => {
    const result = await executeTool(
      "update_task_status",
      {},
      PROJECT_ID,
      USER_ID,
    );
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("taskId and status are required");
  });
});

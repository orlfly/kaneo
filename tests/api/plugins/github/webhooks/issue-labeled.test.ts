import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleIssueLabeled } from "../../../../../apps/api/src/plugins/github/webhooks/issue-labeled";

const mocks = vi.hoisted(() => {
  return {
    findAllIntegrationsByRepo: vi.fn(),
    findExternalLink: vi.fn(),
    taskFindFirst: vi.fn(),
    taskUpdate: vi.fn(),
    updateTaskStatus: vi.fn(),
    publishEvent: vi.fn(),
    labelInsert: vi.fn(),
    labelFindMany: vi.fn(),
    labelDelete: vi.fn(),
  };
});

vi.mock("../../../../../apps/api/src/database", () => ({
  default: {
    update: () => ({
      set: () => ({ where: () => ({}) }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: async () => [] }),
      }),
    }),
    delete: () => ({ where: () => ({}) }),
    query: {
      labelTable: {
        findMany: mocks.labelFindMany,
      },
      taskTable: {
        findFirst: mocks.taskFindFirst,
      },
    },
  },
}));

vi.mock(
  "../../../../../apps/api/src/plugins/github/services/task-service",
  () => ({
    findAllIntegrationsByRepo: (...args: unknown[]) =>
      mocks.findAllIntegrationsByRepo(...args),
    isTaskInFinalState: async (task: {
      status: string;
      columnId: string | null;
    }) => {
      // Mirror the real implementation: resolve the task's column by id when
      // present, else by status slug, else the literal "done" fallback.
      if (task.columnId === "col-done") return true;
      if (task.columnId) return false;
      return task.status === "done";
    },
    updateTaskStatus: (...args: unknown[]) => mocks.updateTaskStatus(...args),
  }),
);

vi.mock(
  "../../../../../apps/api/src/plugins/github/services/link-manager",
  () => ({
    findExternalLink: (...args: unknown[]) => mocks.findExternalLink(...args),
    createExternalLink: vi.fn(),
    findExternalLinks: vi.fn(),
    updateExternalLink: vi.fn(),
    createOrUpdateExternalLink: vi.fn(),
  }),
);

vi.mock("../../../../../apps/api/src/events", () => ({
  publishEvent: (...args: unknown[]) => mocks.publishEvent(...args),
}));

const integration = {
  id: "integration-1",
  projectId: "project-1",
  isActive: true,
  type: "github",
  config: JSON.stringify({
    repositoryOwner: "usekaneo",
    repositoryName: "kaneo",
    branchPattern: "{slug}-{number}",
  }),
  project: null,
};

function labeledPayload(labels: string[]) {
  return {
    action: "labeled",
    issue: { number: 42, labels },
    label: { name: labels[labels.length - 1] ?? "", color: "000000" },
    repository: { id: 1, owner: { login: "usekaneo" }, name: "kaneo" },
  };
}

describe("handleIssueLabeled final-state guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllIntegrationsByRepo.mockResolvedValue([integration]);
    mocks.findExternalLink.mockResolvedValue({
      id: "link-1",
      taskId: "task-1",
      integrationId: "integration-1",
      metadata: null,
    });
    mocks.labelFindMany.mockResolvedValue([]);
    mocks.updateTaskStatus.mockResolvedValue({ applied: false });
  });

  it("does not move a done task when a status: label changes", async () => {
    mocks.taskFindFirst.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      status: "done",
      columnId: "col-done",
    });

    await handleIssueLabeled(labeledPayload(["status:in-progress"]));

    expect(mocks.updateTaskStatus).not.toHaveBeenCalled();
    expect(mocks.publishEvent).not.toHaveBeenCalled();
  });

  it("does not touch priority on a final-state task", async () => {
    mocks.taskFindFirst.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      status: "done",
      columnId: "col-done",
    });

    await handleIssueLabeled(labeledPayload(["priority:high"]));

    // The guard short-circuits before any task write; updateTaskStatus is the
    // observable proxy here since the priority write has no result hook.
    expect(mocks.updateTaskStatus).not.toHaveBeenCalled();
  });

  it("still updates a non-final task on status: label changes", async () => {
    mocks.taskFindFirst.mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      status: "to-do",
      columnId: "col-todo",
    });
    mocks.updateTaskStatus.mockResolvedValue({
      applied: true,
      before: {
        id: "task-1",
        status: "to-do",
        projectId: "project-1",
        title: "t",
        userId: null,
      },
      after: {
        id: "task-1",
        status: "in-progress",
        projectId: "project-1",
        title: "t",
        userId: null,
      },
    });

    await handleIssueLabeled(labeledPayload(["status:in-progress"]));

    expect(mocks.updateTaskStatus).toHaveBeenCalledWith(
      "task-1",
      "in-progress",
    );
    expect(mocks.publishEvent).toHaveBeenCalled();
  });
});

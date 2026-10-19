import enUS from "@i18n/en-US.json";
import { cleanup, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import TaskCardContextMenuContent from "./task-card-context-menu-content";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
  ContextMenuItem: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
  ContextMenuSeparator: (): React.JSX.Element => <div />,
  ContextMenuSub: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
  ContextMenuSubContent: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
  ContextMenuSubTrigger: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
  ContextMenuCheckboxItem: ({
    children,
  }: {
    children: React.ReactNode;
  }): React.JSX.Element => <div>{children}</div>,
}));

vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({
    data: [],
  }),
}));

vi.mock("@/hooks/queries/team-member/use-get-active-team-members", () => ({
  useGetActiveTeamMembers: () => ({
    data: [],
  }),
}));

vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-description", () => ({
  useUpdateTaskDescription: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-due-date", () => ({
  useUpdateTaskDueDate: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-status", () => ({
  useUpdateTaskStatus: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-status-priority", () => ({
  useUpdateTaskPriority: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-title", () => ({
  useUpdateTaskTitle: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: () => true,
    canDeleteTasks: () => true,
    canAssignTasks: () => true,
  }),
}));

vi.mock("@/store/project", () => ({
  default: () => ({
    project: {
      columns: [],
    },
  }),
}));

// A dedicated instance: the app singleton must not be imported beside a
// react-i18next mock. Inline resources keep the copy available synchronously.
const translations = i18next.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": enUS },
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

beforeEach(async () => {
  await translations;
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  // Bind once: a fresh `t` on every render re-creates anything keyed on it.
  const t = i18next.t.bind(i18next);
  return { ...actual, useTranslation: () => ({ t, i18n: i18next }) };
});

const task = {
  id: "task-1",
  title: "Test task",
  number: 1,
  description: null,
  status: "to-do",
  priority: null,
  startDate: null,
  dueDate: null,
  position: 1,
  createdAt: "2026-08-05T00:00:00.000Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  projectId: "project-1",
} as const satisfies Task;

const taskCardContext = {
  teamId: "team-1",
  projectId: "project-1",
};

function renderTask(taskToRender: Task) {
  render(
    <TaskCardContextMenuContent
      task={taskToRender}
      taskCardContext={taskCardContext}
      onDeleteClick={vi.fn()}
    />,
  );
}

describe("TaskCardContextMenuContent", () => {
  it("hides Mark as planned for planned tasks", () => {
    renderTask({
      ...task,
      status: "planned",
    });

    expect(screen.queryByText("Mark as planned")).not.toBeInTheDocument();
  });

  it("shows Mark as planned for tasks that are not planned", () => {
    renderTask(task);

    expect(screen.getByText("Mark as planned")).toBeInTheDocument();
  });
});

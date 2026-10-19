import enUS from "@i18n/en-US.json";
import { cleanup, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import TaskRow from "./task-row";

const useExternalLinks = vi.fn((_taskId: string) => ({ data: [] }));
const useGetLabelsByTask = vi.fn((_taskId: string) => ({ data: [] }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/queries/external-link/use-external-links", () => ({
  default: (taskId: string) => useExternalLinks(taskId),
}));

vi.mock("@/hooks/queries/label/use-get-labels-by-task", () => ({
  default: (taskId: string) => useGetLabelsByTask(taskId),
}));

vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/queries/team/use-active-team", () => ({
  default: () => ({ data: { id: "workspace-1" } }),
}));

vi.mock("@/hooks/queries/team-member/use-get-active-team-members", () => ({
  useGetActiveTeamMembers: () => ({ data: [] }),
}));

vi.mock(
  "../kanban-board/task-card-context-menu/task-card-context-menu-content",
  () => ({ default: () => null }),
);

vi.mock("@/store/bulk-selection", () => ({
  default: () => ({
    toggleSelection: vi.fn(),
    isSelected: () => false,
    isFocused: () => false,
  }),
}));

vi.mock("@/store/project", () => ({
  default: () => ({ project: { id: "project-1", slug: "kan" } }),
}));

vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: () => ({
    showAssignees: true,
    showDueDates: true,
    showLabels: true,
    showTaskNumbers: true,
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

const task: Task = {
  id: "task-1",
  title: "Row from payload",
  number: 7,
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
  labels: [{ id: "label-1", name: "Bug", color: "red" }],
  externalLinks: [
    {
      id: "link-1",
      taskId: "task-1",
      integrationId: "integration-1",
      resourceType: "pull_request",
      externalId: "42",
      url: "https://github.com/o/r/pull/42",
      title: "Fix it",
      metadata: { merged: false, draft: false },
    },
  ],
};

describe("TaskRow", () => {
  it("renders labels and pull requests from the task payload without per-row requests", () => {
    render(<TaskRow task={task} projectSlug="kan" />);

    expect(screen.getByText("Bug")).toBeVisible();
    expect(screen.getByText("#42")).toBeVisible();
    expect(useExternalLinks).not.toHaveBeenCalled();
    expect(useGetLabelsByTask).not.toHaveBeenCalled();
  });
});

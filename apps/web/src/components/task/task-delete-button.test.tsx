import enUS from "@i18n/en-US.json";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TaskDeleteButton from "./task-delete-button";

const mocks = vi.hoisted(() => ({
  canDeleteTasks: vi.fn(),
  deleteTask: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

// A dedicated instance: the app singleton must not be imported beside a
// react-i18next mock. Inline resources keep the copy available synchronously.
const translations = i18next.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": enUS },
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  // Bind once: a fresh `t` on every render re-creates anything keyed on it.
  const t = i18next.t.bind(i18next);
  return { ...actual, useTranslation: () => ({ t, i18n: i18next }) };
});
vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({
    mutateAsync: mocks.deleteTask,
    isPending: false,
  }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canDeleteTasks: mocks.canDeleteTasks,
    isCheckingPermissions: false,
  }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: mocks.error, success: mocks.success },
}));

beforeEach(async () => {
  await translations;
  mocks.canDeleteTasks.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskDeleteButton", () => {
  it("is only shown to users with task deletion permission", () => {
    mocks.canDeleteTasks.mockReturnValue(false);

    render(<TaskDeleteButton taskId="task-1" onDeleted={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Delete Task" })).toBeNull();
  });

  it("deletes after confirmation and reports success", async () => {
    const onDeleted = vi.fn();
    mocks.deleteTask.mockResolvedValue({ id: "task-1" });
    render(<TaskDeleteButton taskId="task-1" onDeleted={onDeleted} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Task" }));
    const deleteButtons = await screen.findAllByRole("button", {
      name: "Delete Task",
    });
    fireEvent.click(deleteButtons.at(-1) as HTMLButtonElement);

    await waitFor(() =>
      expect(mocks.deleteTask).toHaveBeenCalledWith("task-1"),
    );
    expect(mocks.success).toHaveBeenCalledWith("Task deleted successfully");
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("keeps the current view open and reports a failed deletion", async () => {
    const onDeleted = vi.fn();
    mocks.deleteTask.mockRejectedValue(new Error("Delete denied"));
    render(<TaskDeleteButton taskId="task-1" onDeleted={onDeleted} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Task" }));
    const deleteButtons = await screen.findAllByRole("button", {
      name: "Delete Task",
    });
    fireEvent.click(deleteButtons.at(-1) as HTMLButtonElement);

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Delete denied"),
    );
    expect(mocks.success).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

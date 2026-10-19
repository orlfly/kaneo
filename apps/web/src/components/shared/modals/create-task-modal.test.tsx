import enUS from "@i18n/en-US.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import i18next from "i18next";
import type { ReactNode } from "react";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CreateTaskModal from "./create-task-modal";

// A dedicated instance, never the app singleton: importing `@/lib/i18n` next to
// a react-i18next mock deadlocks the vitest 4 worker. Inline resources keep the
// copy synchronous too, so a key the reference locale lacks fails a test here
// instead of rendering its own identifier to the user.
const translations = i18next.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": enUS },
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: i18next.t.bind(i18next) }),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const useLocation = vi.fn();
const deleteTask = vi.fn(async () => {});
const updateTask = vi.fn(async (input: Record<string, unknown>) => input);
const setProject = vi.fn();
let workspaceId = "workspace-1";
let projects: { id: string; name: string; slug: string }[] | undefined;
let storedProject: { id: string; columns: unknown[] } | null = null;
let ensureTaskId: (() => Promise<string | null>) | undefined;

beforeEach(async () => {
  await translations;
  workspaceId = "workspace-1";
  projects = [
    { id: "project-1", name: "Alpha", slug: "alp" },
    { id: "project-2", name: "Beta", slug: "bet" },
  ];
  storedProject = null;
  useLocation.mockReturnValue({ pathname: "/dashboard/team/workspace-1" });
});
const createTask = vi.fn(async (input: Record<string, unknown>) => ({
  id: "task-1",
  title: input.title,
  status: input.status,
  projectId: input.projectId,
  createdAt: "2026-08-05T00:00:00.000Z",
}));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => useLocation(),
  useParams: ({
    select,
  }: {
    select: (params: Record<string, unknown>) => unknown;
  }) =>
    select({
      workspaceId: useLocation().pathname.match(/\/team\/([^/]+)/)?.[1],
    }),
}));

vi.mock("@/components/task/task-description-editor", () => ({
  default: (props: {
    taskId?: string;
    ensureTaskId: () => Promise<string | null>;
  }) => {
    ensureTaskId = props.ensureTaskId;
    return <div data-testid="description-editor" data-task-id={props.taskId} />;
  },
}));

vi.mock("@/hooks/mutations/label/use-create-label", () => ({
  default: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-create-task", () => ({
  default: () => ({ mutateAsync: createTask }),
}));

vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: deleteTask }),
}));

vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: updateTask }),
}));

vi.mock("@/hooks/queries/label/use-get-labels-by-team", () => ({
  default: () => ({ data: [] }),
}));

vi.mock("@/hooks/queries/team/use-active-team", () => ({
  default: () => ({ data: { id: workspaceId, name: "WS" } }),
}));

vi.mock("@/hooks/queries/team-member/use-get-active-team-members", () => ({
  useGetActiveTeamMembers: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: () => true,
    canCreateLabels: () => true,
  }),
}));

vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: projects }),
}));

vi.mock("@/store/project", () => ({
  default: () => ({ project: storedProject, setProject }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("CreateTaskModal", () => {
  it("keeps unsaved input while discard confirmation is open", async () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/team/workspace-1/project/project-1/board",
    });
    const onClose = vi.fn();

    render(<CreateTaskModal open onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    const titleInput = screen.getByPlaceholderText(
      "Describe the task in plain English",
    );
    fireEvent.change(titleInput, { target: { value: "Unsaved task" } });

    const backdrop = document.querySelector('[data-slot="dialog-backdrop"]');
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.pointerUp(backdrop as Element);
    fireEvent.click(backdrop as Element);

    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText("Discard task?")).toBeTruthy();
    expect(titleInput).toHaveValue("Unsaved task");

    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });

    expect(createTask).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes after the user confirms discarding unsaved input", async () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/team/workspace-1/project/project-1/board",
    });
    const onClose = vi.fn();

    render(<CreateTaskModal open onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    fireEvent.change(
      screen.getByPlaceholderText("Describe the task in plain English"),
      { target: { value: "Unsaved task" } },
    );
    const backdrop = document.querySelector('[data-slot="dialog-backdrop"]');
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.pointerUp(backdrop as Element);
    fireEvent.click(backdrop as Element);

    await screen.findByText("Discard task?");

    fireEvent.click(screen.getByText("Discard task"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("treats a selected project as unsaved input", async () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/team/workspace-1",
    });

    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText("Select project"));
    fireEvent.click(await screen.findByText("Beta"));
    const backdrop = document.querySelector('[data-slot="dialog-backdrop"]');
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.pointerUp(backdrop as Element);
    fireEvent.click(backdrop as Element);

    expect(await screen.findByText("Discard task?")).toBeTruthy();
  });

  it("shows a project picker and creates the task in the chosen project", async () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/team/workspace-1",
    });

    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    const pickerTrigger = screen.getByText("Select project");
    fireEvent.click(pickerTrigger);
    fireEvent.click(await screen.findByText("Beta"));

    fireEvent.change(
      screen.getByPlaceholderText("Describe the task in plain English"),
      { target: { value: "Picked project task" } },
    );
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await vi.waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Picked project task",
          projectId: "project-2",
        }),
      );
    });
  });

  it("hides the picker when a project is in scope from the route", () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/team/workspace-1/project/project-1/board",
    });

    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByText("Select project")).toBeNull();
  });
});

function enterTitle(title = "Private task") {
  fireEvent.change(
    screen.getByPlaceholderText("Describe the task in plain English"),
    {
      target: { value: title },
    },
  );
}

async function chooseBeta() {
  fireEvent.click(screen.getByText("Select project"));
  fireEvent.click(await screen.findByText("Beta"));
}

function submit() {
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
}

function pendingCreate() {
  let resolve!: (task: never) => void;
  createTask.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  return () =>
    resolve({
      id: "old-draft",
      title: "Draft",
      status: "planned",
      projectId: "project-2",
      createdAt: "2026-08-05T00:00:00.000Z",
    } as never);
}

describe("CreateTaskModal context isolation", () => {
  it("never falls back to the last globally visited project", () => {
    storedProject = { id: "foreign-project", columns: [] };
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    enterTitle();
    expect(screen.getByText("Create Task")).toBeDisabled();
    submit();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("clears selected project and private fields after close and reopen", async () => {
    const props = { open: true, onClose: vi.fn() };
    const view = render(<CreateTaskModal {...props} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    view.rerender(<CreateTaskModal {...props} open={false} />);
    view.rerender(<CreateTaskModal {...props} />);
    expect(
      screen.getByPlaceholderText("Describe the task in plain English"),
    ).toHaveValue("");
    enterTitle("New task");
    submit();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("clears team A's selection when team B becomes active", async () => {
    const view = render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    workspaceId = "workspace-2";
    projects = [{ id: "project-3", name: "Gamma", slug: "gam" }];
    useLocation.mockReturnValue({
      pathname: "/dashboard/team/workspace-2",
    });
    view.rerender(<CreateTaskModal open onClose={vi.fn()} />);
    enterTitle("Team B secret");
    submit();
    expect(createTask).not.toHaveBeenCalled();
    expect(screen.getByText("Select project")).toBeInTheDocument();
  });

  it("does not expose the previous team while the route's team is loading", async () => {
    const view = render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    useLocation.mockReturnValue({
      pathname: "/dashboard/team/workspace-2",
    });
    view.rerender(<CreateTaskModal open onClose={vi.fn()} />);
    expect(screen.queryByTestId("description-editor")).toBeNull();
    expect(createTask).not.toHaveBeenCalled();
  });

  it.each([undefined, []])(
    "rejects explicit project IDs until current team query proves membership (%s)",
    async (data) => {
      projects = data;
      render(<CreateTaskModal open projectId="project-2" onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      });
      enterTitle();
      submit();
      await expect(ensureTaskId?.()).resolves.toBeNull();
      expect(createTask).not.toHaveBeenCalled();
    },
  );

  it("deletes a late draft after navigation without handing its ID to an upload", async () => {
    const finish = pendingCreate();
    const view = render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    let pending!: Promise<string | null>;
    act(() => {
      pending = ensureTaskId?.() as Promise<string | null>;
    });
    workspaceId = "workspace-2";
    useLocation.mockReturnValue({
      pathname: "/dashboard/team/workspace-2",
    });
    view.rerender(<CreateTaskModal open onClose={vi.fn()} />);
    await act(async () => {
      finish();
      await pending;
    });
    await expect(pending).resolves.toBeNull();
    expect(deleteTask).toHaveBeenCalledExactlyOnceWith("old-draft");
    expect(screen.getByTestId("description-editor")).not.toHaveAttribute(
      "data-task-id",
    );
    expect(updateTask).not.toHaveBeenCalled();
    expect(setProject).not.toHaveBeenCalled();
  });

  it("waits for the upload draft on submit and saves that task only once", async () => {
    const finish = pendingCreate();
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    let pending!: Promise<string | null>;
    act(() => {
      pending = ensureTaskId?.() as Promise<string | null>;
    });
    submit();
    submit();
    expect(updateTask).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await pending;
    });
    await vi.waitFor(() =>
      expect(updateTask).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          id: "old-draft",
          projectId: "project-2",
          title: "Private task",
        }),
      ),
    );
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it("discards an existing draft on close and never puts it into another project's store", async () => {
    storedProject = { id: "project-1", columns: [] };
    const view = render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await act(async () => {
      await ensureTaskId?.();
    });
    view.rerender(<CreateTaskModal open={false} onClose={vi.fn()} />);
    expect(deleteTask).toHaveBeenCalledExactlyOnceWith("task-1");
    expect(setProject).not.toHaveBeenCalled();
  });
});

describe("CreateTaskModal status label", () => {
  function openFromColumn(status: string, columns: unknown[]) {
    storedProject = { id: "project-2", columns } as never;
    useLocation.mockReturnValue({
      pathname: "/dashboard/team/workspace-1/project/project-2/board",
    });
    render(<CreateTaskModal open onClose={vi.fn()} status={status} />, {
      wrapper: createWrapper(),
    });
    return document.querySelector('[data-slot="dialog-popup"]');
  }

  it("names the shipped column it will create the task in", async () => {
    const dialog = openFromColumn("to-do", [
      { slug: "to-do", name: "To Do", tasks: [] },
    ]);

    expect(dialog?.textContent).toContain("To Do");
  });

  it("names a custom column instead of the status key", async () => {
    const dialog = openFromColumn("blocked", [
      { slug: "blocked", name: "Blocked by review", tasks: [] },
    ]);

    expect(dialog?.textContent).toContain("Blocked by review");
    expect(dialog?.textContent).not.toContain("status.blocked");
  });
});

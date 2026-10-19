import enUS from "@i18n/en-US.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import i18next from "i18next";
import type { ReactNode } from "react";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicTaskDescription } from "@/fetchers/task/get-description-pages";
import type Task from "@/types/task";
import { PublicTaskDetailModal } from "./task-detail-modal";

// A dedicated instance, never the app singleton: importing `@/lib/i18n` beside a
// react-i18next mock deadlocks the vitest worker.
const translations = i18next.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": enUS },
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

vi.mock("@/fetchers/task/get-description-pages", () => ({
  getPublicTaskDescription: vi.fn(),
}));
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  // Bind once: a fresh `t` on every render re-creates anything keyed on it.
  const t = i18next.t.bind(i18next);
  return { ...actual, useTranslation: () => ({ t, i18n: i18next }) };
});
vi.mock("./markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogPopup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
const task: Task = {
  id: "task",
  projectId: "project",
  title: "Task",
  number: 1,
  description: null,
  descriptionDeferred: true,
  status: "",
  priority: null,
  startDate: null,
  dueDate: null,
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
};
let client: QueryClient;
function modal(
  selected: Task | null,
  open = true,
  columns?: Array<{ slug: string; name?: string; isFinal: boolean }>,
) {
  return (
    <QueryClientProvider client={client}>
      <PublicTaskDetailModal
        task={selected}
        projectSlug="PRJ"
        columns={columns}
        open={open}
        onOpenChange={() => {}}
      />
    </QueryClientProvider>
  );
}
beforeEach(async () => {
  await translations;
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("public deferred task details", () => {
  it("loads only when opened, shows loading, then renders the full description", async () => {
    let resolve!: (value: string) => void;
    vi.mocked(getPublicTaskDescription).mockReturnValue(
      new Promise<string>((done) => {
        resolve = done;
      }),
    );
    const view = render(modal(task, false));
    expect(getPublicTaskDescription).not.toHaveBeenCalled();
    view.rerender(modal(task));
    expect(screen.getByRole("status").textContent).toContain(
      "Loading description…",
    );
    resolve("Full deferred description");
    expect(await screen.findByText("Full deferred description")).toBeTruthy();
    expect(getPublicTaskDescription).toHaveBeenCalledWith(
      "project",
      "task",
      expect.any(AbortSignal),
    );
  });
  it("shows a retry on failure and does not display partial content as success", async () => {
    vi.mocked(getPublicTaskDescription)
      .mockRejectedValueOnce(new Error("changed"))
      .mockResolvedValueOnce("Current revision");
    render(modal(task));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Retry"));
    expect(await screen.findByText("Current revision")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
  it("renders ordinary descriptions without requesting chunks", () => {
    render(
      modal({ ...task, descriptionDeferred: false, description: "Small text" }),
    );
    expect(screen.getByText("Small text")).toBeTruthy();
    expect(getPublicTaskDescription).not.toHaveBeenCalled();
  });

  it("names a shipped column for the task status", () => {
    render(
      modal({ ...task, status: "to-do" }, true, [
        { slug: "to-do", name: "To Do", isFinal: false },
      ]),
    );

    expect(screen.getByText("To Do")).toBeTruthy();
  });

  it("names a custom column instead of the status key", () => {
    render(
      modal({ ...task, status: "blocked-by-review" }, true, [
        {
          slug: "blocked-by-review",
          name: "Blocked by review",
          isFinal: false,
        },
      ]),
    );

    expect(screen.getByText("Blocked by review")).toBeTruthy();
    expect(screen.queryByText(/status\.blocked-by-review/)).toBeNull();
  });
});

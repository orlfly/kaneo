import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  component: (() => null) as ComponentType,
  navigate: vi.fn(),
  update: vi.fn(),
  tasks: [] as Record<string, unknown>[],
  /** Replaces the whole `useQuery` result, so tests can also cover failures. */
  relationsResult: { data: [] as unknown } as Record<string, unknown>,
  // Returns the key, so existing assertions keep working, while recording the
  // interpolation parameters for the cases that assert them.
  t: vi.fn((key: string) => key),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    m.component = options.component;
    return {
      useParams: () => ({ projectId: "project", workspaceId: "workspace" }),
      useSearch: () => ({}),
    };
  },
  useNavigate: () => m.navigate,
}));
vi.mock("@/components/common/project-layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/components/task/task-details-sheet", () => ({
  default: () => null,
}));
vi.mock("@/hooks/queries/task/use-get-tasks", () => ({
  useGetTasks: () => ({
    data: {
      name: "Project",
      slug: "PROJ",
      columns: [{ tasks: m.tasks }],
      plannedTasks: [],
    },
  }),
}));
vi.mock("@/hooks/queries/task-relation/use-get-project-task-relations", () => ({
  default: () => m.relationsResult,
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: m.update }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: () => 1,
}));
vi.mock("@/lib/i18n/domain", () => ({
  getStatusLabel: (status: string) => status,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: m.t }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));

await import(
  "@/routes/_layout/_authenticated/dashboard/team/$teamId/project/$projectId/gantt"
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  m.relationsResult = { data: [] };
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("PointerEvent", MouseEvent);
});
function task(id: string, startDate: string, dueDate: string) {
  return {
    id,
    projectId: "project",
    title: id,
    number: 1,
    status: "to-do",
    startDate,
    dueDate,
    description: "",
    labels: [],
    priority: "low",
    position: 1,
  };
}
function show() {
  const Component = m.component;
  return render(<Component />);
}

describe("Gantt window UI", () => {
  it("renders a bounded grid for a centuries-long legacy task and makes clipped bars safe to open", () => {
    m.tasks = [task("Long-lived", "0001-01-01", "9999-12-31")];
    const { container } = show();
    const grids = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[style*="grid-template-columns: repeat"]',
      ),
    );
    expect(grids.length).toBeGreaterThan(0);
    expect(
      grids.every((grid) => /repeat\(91,/.test(grid.style.gridTemplateColumns)),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "tasks:gantt.resizeStart" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "tasks:gantt.resizeDue" }),
    ).toBeDisabled();
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "tasks:gantt.taskAriaLabel" }),
      { button: 0 },
    );
    expect(m.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { taskId: "Long-lived" } }),
    );
    expect(m.update).not.toHaveBeenCalled();
  });

  it("can jump to a far-away task and navigate without losing its row", () => {
    m.tasks = [
      task("Ancient", "0001-01-01", "0001-01-02"),
      task("Future", "9999-12-30", "9999-12-31"),
    ];
    const { container } = show();
    const jump = screen.getAllByRole("button", {
      name: "tasks:gantt.showTaskDates",
    });
    expect(jump).toHaveLength(2);
    fireEvent.click(jump[1]);
    expect(screen.getByLabelText("tasks:gantt.periodStart")).toHaveValue(
      "9999-10-02",
    );
    expect(
      screen.getByRole("button", { name: "tasks:gantt.nextPeriod" }),
    ).toBeDisabled();
    expect(screen.getByText("Ancient")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:gantt.previousPeriod" }),
    );
    expect(
      screen.getByRole("button", { name: "tasks:gantt.nextPeriod" }),
    ).not.toBeDisabled();
    expect(
      container.querySelectorAll('[style*="repeat(91,"]').length,
    ).toBeGreaterThan(0);
  });

  it("supports entering a date directly while keeping the allocated period bounded", () => {
    m.tasks = [task("Long-lived", "0001-01-01", "9999-12-31")];
    const { container } = show();
    fireEvent.change(screen.getByLabelText("tasks:gantt.periodStart"), {
      target: { value: "2050-01-01" },
    });
    expect(screen.getByLabelText("tasks:gantt.periodStart")).toHaveValue(
      "2050-01-01",
    );
    expect(
      container.querySelectorAll('[style*="repeat(91,"]').length,
    ).toBeGreaterThan(0);
  });

  it("badges the blocked task with the names of its blockers", () => {
    m.tasks = [
      task("Blocker", "2026-08-01", "2026-08-05"),
      task("Blocked", "2026-08-10", "2026-08-12"),
    ];
    m.relationsResult = {
      data: [
        {
          id: "rel-1",
          sourceTaskId: "Blocker",
          targetTaskId: "Blocked",
          relationType: "blocks",
          sourceTask: { id: "Blocker", title: "Blocker", number: 1 },
          targetTask: { id: "Blocked", title: "Blocked", number: 2 },
        },
      ],
    };

    show();

    // The badge names the blocker on the blocked bar, which is what still
    // works when the blocker's bar is scrolled out of the visible window.
    const badges = screen.getAllByRole("img", {
      name: /tasks:gantt.blockedBy/,
    });
    expect(badges).toHaveLength(1);
  });

  it("badges a blocked task whose blocker lives in another project", () => {
    m.tasks = [task("Blocked", "2026-08-10", "2026-08-12")];
    // The blocker is not on this project's timeline: the connector cannot be
    // drawn, but the badge still names what holds the task up.
    m.relationsResult = {
      data: [
        {
          id: "rel-cross",
          sourceTaskId: "other-project-task",
          targetTaskId: "Blocked",
          relationType: "blocks",
          sourceTask: {
            id: "other-project-task",
            title: "Other project blocker",
            number: 7,
            projectId: "other-project",
          },
          targetTask: {
            id: "Blocked",
            title: "Blocked",
            number: 2,
            projectId: "project-1",
          },
        },
      ],
    };

    const { container } = show();

    const badges = screen.getAllByRole("img", {
      name: /tasks:gantt.blockedBy/,
    });
    expect(badges).toHaveLength(1);
    // A cross-project blocker is named by number without borrowing this
    // project's slug.
    expect(m.t).toHaveBeenCalledWith("tasks:gantt.blockedBy", {
      tasks: "#7 Other project blocker",
    });
    expect(
      container.querySelectorAll("[data-gantt-dependency-overlay] svg > g"),
    ).toHaveLength(0);
  });

  it("keeps the chart usable when the relations request fails", () => {
    m.tasks = [task("Blocker", "2026-08-01", "2026-08-05")];
    m.relationsResult = {
      data: undefined,
      isError: true,
      error: new Error("403 Forbidden"),
    };

    const { container } = show();

    // A relations outage costs the connectors, never the timeline.
    expect(screen.getAllByText("Blocker").length).toBeGreaterThan(0);
    expect(
      container.querySelectorAll("[data-gantt-dependency-overlay] svg > g"),
    ).toHaveLength(0);
  });

  it("draws a connector inside the dependency overlay once bars and relations exist", () => {
    m.tasks = [
      task("Blocker", "2026-08-01", "2026-08-05"),
      task("Blocked", "2026-08-10", "2026-08-12"),
    ];
    m.relationsResult = {
      data: [
        {
          id: "rel-1",
          sourceTaskId: "Blocker",
          targetTaskId: "Blocked",
          relationType: "blocks",
          sourceTask: { id: "Blocker", title: "Blocker", number: 1 },
          targetTask: { id: "Blocked", title: "Blocked", number: 2 },
        },
      ],
    };

    const { container } = show();

    // The overlay owns the SVG: a hydrated relation whose endpoints were both
    // measured reaches it, and jsdom's zero-size bars must degrade to a drawn
    // path rather than throwing.
    const overlay = container.querySelector("[data-gantt-dependency-overlay]");
    expect(overlay).not.toBeNull();
    const groups = overlay?.querySelectorAll("svg > g") ?? [];
    expect(groups).toHaveLength(1);
    expect(groups[0]?.querySelector("title")?.textContent).toContain(
      "tasks:gantt.dependencyTitle",
    );

    // A relation whose blocked task is not on the timeline draws nothing.
    m.relationsResult = {
      data: [
        {
          id: "rel-2",
          sourceTaskId: "Blocker",
          targetTaskId: "not-on-the-chart",
          relationType: "blocks",
          sourceTask: { id: "Blocker", title: "Blocker", number: 1 },
          targetTask: { id: "not-on-the-chart", title: "Missing", number: 3 },
        },
      ],
    };
    const second = show();
    expect(
      second.container.querySelectorAll(
        "[data-gantt-dependency-overlay] svg > g",
      ),
    ).toHaveLength(0);
  });
});

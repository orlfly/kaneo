import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTaskFiltersWithLabelsSupport } from "./use-task-filters-with-labels-support";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function makeProject(taskOverrides?: Partial<{ id: string; title: string }>) {
  return {
    id: "project-1",
    name: "Project",
    slug: "PROJ",
    icon: null,
    description: null,
    isPublic: false,
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    teamId: "team-1",
    columns: [
      {
        id: "todo",
        slug: "todo",
        name: "Todo",
        icon: null,
        isFinal: false,
        tasks: [
          {
            id: "task-1",
            title: "First task",
            number: 1,
            description: null,
            status: "todo",
            priority: null,
            startDate: null,
            dueDate: null,
            position: 0,
            createdAt: "2026-04-16T00:00:00.000Z",
            updatedAt: "2026-04-16T00:00:00.000Z",
            userId: null,
            assigneeId: null,
            assigneeName: null,
            assigneeImage: null,
            projectId: "project-1",
            labels: [],
            externalLinks: [],
            ...(taskOverrides ?? {}),
          },
          {
            id: "task-2",
            title: "Second task",
            number: 2,
            description: null,
            status: "todo",
            priority: null,
            startDate: null,
            dueDate: null,
            position: 1,
            createdAt: "2026-04-16T00:00:00.000Z",
            updatedAt: "2026-04-16T00:00:00.000Z",
            userId: null,
            assigneeId: null,
            assigneeName: null,
            assigneeImage: null,
            projectId: "project-1",
            labels: [],
            externalLinks: [],
          },
        ],
      },
    ],
    plannedTasks: [],
    pausedTasks: [],
    archivedTasks: [],
  };
}

function seedCustomFieldValues(
  queryClient: QueryClient,
  values: Record<string, Array<{ fieldId: string; value: string | null }>>,
) {
  for (const [taskId, taskValues] of Object.entries(values)) {
    queryClient.setQueryData(["custom-field-values", taskId], taskValues);
  }
}

function setup(
  seed?: Record<string, Array<{ fieldId: string; value: string | null }>>,
) {
  const queryClient = createTestQueryClient();
  if (seed) seedCustomFieldValues(queryClient, seed);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    () => useTaskFiltersWithLabelsSupport(makeProject(), "project-1"),
    { wrapper: Wrapper },
  );
  return { ...rendered, queryClient };
}

describe("useTaskFilters customFields support", () => {
  const storageKey = "kaneo:board-filters:project-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("does not filter when no customFields filters are active", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(result.current.filteredProject).toBeTruthy();
    });

    expect(result.current.filteredProject?.columns[0]?.tasks).toHaveLength(2);
  });

  it("filters tasks by a custom field value selected via updateCustomFieldFilter", async () => {
    const { result } = setup({
      "task-1": [{ fieldId: "field-priority", value: "high" }],
      "task-2": [{ fieldId: "field-priority", value: "low" }],
    });

    await waitFor(() => {
      expect(result.current.filteredProject).toBeTruthy();
    });

    act(() => {
      result.current.updateCustomFieldFilter("field-priority", "high");
    });

    const tasks = result.current.filteredProject?.columns[0]?.tasks ?? [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe("task-1");
  });

  it("excludes tasks with null or empty values for the filtered field", async () => {
    const { result } = setup({
      "task-1": [{ fieldId: "field-priority", value: "high" }],
      "task-2": [{ fieldId: "field-priority", value: null }],
    });

    await waitFor(() => {
      expect(result.current.filteredProject).toBeTruthy();
    });

    act(() => {
      result.current.updateCustomFieldFilter("field-priority", "high");
    });

    const tasks = result.current.filteredProject?.columns[0]?.tasks ?? [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe("task-1");
  });

  it("excludes tasks with empty string values for the filtered field", async () => {
    const { result } = setup({
      "task-1": [{ fieldId: "field-priority", value: "high" }],
      "task-2": [{ fieldId: "field-priority", value: "" }],
    });

    await waitFor(() => {
      expect(result.current.filteredProject).toBeTruthy();
    });

    act(() => {
      result.current.updateCustomFieldFilter("field-priority", "high");
    });

    const tasks = result.current.filteredProject?.columns[0]?.tasks ?? [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe("task-1");
  });

  it("requires all selected fields to match (AND semantics)", async () => {
    const { result } = setup({
      "task-1": [
        { fieldId: "field-priority", value: "high" },
        { fieldId: "field-size", value: "large" },
      ],
      "task-2": [{ fieldId: "field-priority", value: "high" }],
    });

    await waitFor(() => {
      expect(result.current.filteredProject).toBeTruthy();
    });

    act(() => {
      result.current.updateCustomFieldFilter("field-priority", "high");
      result.current.updateCustomFieldFilter("field-size", "large");
    });

    const tasks = result.current.filteredProject?.columns[0]?.tasks ?? [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe("task-1");
  });

  it("toggles values to support multi-value OR within one field", async () => {
    const { result } = setup({
      "task-1": [{ fieldId: "field-priority", value: "high" }],
      "task-2": [{ fieldId: "field-priority", value: "low" }],
    });

    await waitFor(() => {
      expect(result.current.filteredProject).toBeTruthy();
    });

    act(() => {
      result.current.updateCustomFieldFilter("field-priority", "high");
      result.current.updateCustomFieldFilter("field-priority", "low");
    });

    const tasks = result.current.filteredProject?.columns[0]?.tasks ?? [];
    expect(tasks).toHaveLength(2);
  });

  it("deselecting the last value clears the customFields filter entirely", async () => {
    const { result } = setup({
      "task-1": [{ fieldId: "field-priority", value: "high" }],
      "task-2": [{ fieldId: "field-priority", value: "low" }],
    });

    await waitFor(() => {
      expect(result.current.filteredProject).toBeTruthy();
    });

    act(() => {
      result.current.updateCustomFieldFilter("field-priority", "high");
    });
    act(() => {
      result.current.updateCustomFieldFilter("field-priority", "high");
    });

    // Filter object is fully removed once nothing is selected
    const stored = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "{}",
    ) as { customFields?: Record<string, string[]> | null };

    await waitFor(() => {
      expect(stored.customFields ?? null).toBeNull();
    });

    const tasks = result.current.filteredProject?.columns[0]?.tasks ?? [];
    expect(tasks).toHaveLength(2);
  });

  it("persists restored customFields filters from localStorage and applies them on mount", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ customFields: { "field-priority": ["high"] } }),
    );

    const { result } = setup({
      "task-1": [{ fieldId: "field-priority", value: "high" }],
      "task-2": [{ fieldId: "field-priority", value: "low" }],
    });

    await waitFor(() => {
      expect(result.current.filters.customFields).toEqual({
        "field-priority": ["high"],
      });
    });

    const tasks = result.current.filteredProject?.columns[0]?.tasks ?? [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe("task-1");
  });

  it("restores only valid customFields entries from persisted state", async () => {
    // Malformed persisted payloads should normalize to sane values
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        customFields: {
          "field-empty": [], // rejected by normalizeFilters
          "field-nonstring": [123, null], // rejected (no string items)
          "field-ok": ["a", "b"],
        },
      }),
    );

    const { result } = setup();

    await waitFor(() => {
      expect(result.current.filters.customFields).toEqual({
        "field-ok": ["a", "b"],
      });
    });
  });

  it("reports hasActiveFilters true when only a customFields filter is active", async () => {
    const { result } = setup({
      "task-1": [{ fieldId: "field-priority", value: "high" }],
      "task-2": [{ fieldId: "field-priority", value: "low" }],
    });

    await waitFor(() => {
      expect(result.current.filteredProject).toBeTruthy();
    });

    act(() => {
      result.current.updateCustomFieldFilter("field-priority", "high");
    });

    expect(result.current.hasActiveFilters).toBe(true);
    expect(result.current.clearFilters).toBeInstanceOf(Function);
  });

  it("clearFilters removes customFields filters", async () => {
    const { result } = setup({
      "task-1": [{ fieldId: "field-priority", value: "high" }],
      "task-2": [{ fieldId: "field-priority", value: "low" }],
    });

    await waitFor(() => {
      expect(result.current.filteredProject).toBeTruthy();
    });

    act(() => {
      result.current.updateCustomFieldFilter("field-priority", "high");
    });
    act(() => {
      result.current.clearFilters();
    });

    const tasks = result.current.filteredProject?.columns[0]?.tasks ?? [];
    expect(tasks).toHaveLength(2);
  });
});

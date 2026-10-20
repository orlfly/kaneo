import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import useCreateTaskRelation from "./use-create-task-relation";
import useDeleteTaskRelation from "./use-delete-task-relation";

const mockInvalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  useMutation: (options: {
    onSuccess?: (data: unknown, variables: unknown) => void;
  }) => ({
    mutateAsync: vi.fn().mockImplementation(async (variables: unknown) => {
      // The delete endpoint returns the removed relation, the create endpoint
      // returns the created one; both carry their two endpoints.
      const result = {
        id: "relation-1",
        sourceTaskId: "task-a",
        targetTaskId: "task-b",
        relationType: "blocks",
      };
      await options.onSuccess?.(result, variables);
      return result;
    }),
  }),
}));

vi.mock("@/fetchers/task-relation/create-task-relation", () => ({
  default: vi.fn(),
}));
vi.mock("@/fetchers/task-relation/delete-task-relation", () => ({
  default: vi.fn(),
}));

const invalidatedKeys = () =>
  mockInvalidateQueries.mock.calls.map(
    ([arg]) => (arg as { queryKey: unknown[] }).queryKey,
  );

describe("task relation mutations", () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear();
  });

  it("refreshes both task panels after creating a relation", async () => {
    const { result } = renderHook(() => useCreateTaskRelation());

    await result.current.mutateAsync({
      sourceTaskId: "task-a",
      targetTaskId: "task-b",
      relationType: "blocks",
    });

    expect(invalidatedKeys()).toContainEqual(["task-relations", "task-a"]);
    expect(invalidatedKeys()).toContainEqual(["task-relations", "task-b"]);
  });

  it("refreshes both task panels after deleting a relation", async () => {
    const { result } = renderHook(() => useDeleteTaskRelation("task-a"));

    await result.current.mutateAsync("relation-1");

    // The removed relation has two endpoints; the panel showing the other one
    // must not keep rendering the link.
    expect(invalidatedKeys()).toContainEqual(["task-relations", "task-a"]);
    expect(invalidatedKeys()).toContainEqual(["task-relations", "task-b"]);
  });

  it("refreshes the project-wide edge list the Gantt draws", async () => {
    const created = renderHook(() => useCreateTaskRelation());
    await created.result.current.mutateAsync({
      sourceTaskId: "task-a",
      targetTaskId: "task-b",
      relationType: "blocks",
    });
    mockInvalidateQueries.mockClear();

    const deleted = renderHook(() => useDeleteTaskRelation("task-a"));
    await deleted.result.current.mutateAsync("relation-1");

    // Realtime is the only other path that refreshes this key, so without it a
    // self-hosted instance with WebSockets blocked would draw stale edges.
    expect(invalidatedKeys()).toContainEqual(["task-relations"]);
  });
});

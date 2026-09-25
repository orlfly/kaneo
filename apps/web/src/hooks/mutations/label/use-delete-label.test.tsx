import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useDeleteLabel from "./use-delete-label";

const { remove } = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("@/fetchers/label/delete-label", () => ({ default: remove }));
afterEach(cleanup);
beforeEach(() => {
  remove.mockReset();
});
const root = {
  id: "label",
  teamId: "team",
  taskId: null,
  name: "bug",
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  client.setQueryData(["labels", "team"], [root]);
  client.setQueryData(["tasks", "project"], { id: "project" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(useDeleteLabel, { wrapper }) };
}
describe("label deletion cache state", () => {
  it("retains the root while batches are running and removes it only on completion", async () => {
    let finish!: (label: typeof root) => void;
    remove.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { client, result } = setup();
    act(() => result.current.mutate({ id: root.id }));
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(client.getQueryData(["labels", "team"])).toEqual([root]);
    await act(async () => {
      finish(root);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(["labels", "team"])).toEqual([]);
    expect(client.getQueryState(["tasks", "project"])?.isInvalidated).toBe(
      true,
    );
    client.clear();
  });
  it("refreshes both labels and tasks after a partial operation fails", async () => {
    remove.mockRejectedValue(new Error("connection lost after a batch"));
    const { client, result } = setup();
    act(() => result.current.mutate({ id: root.id }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["labels", "team"])).toEqual([root]);
    expect(client.getQueryState(["labels", "team"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["tasks", "project"])?.isInvalidated).toBe(
      true,
    );
    client.clear();
  });
});

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

// The mutation hooks only record the keys they ask to invalidate. This proves a
// bare prefix invalidation actually reaches the two key shapes the app caches
// relations under, which is the assumption the relation-invalidation fix rests
// on.
describe("task relation cache invalidation", () => {
  it("refreshes task panels and the project edge list, and nothing else", async () => {
    const client = new QueryClient();
    const sourceKey = ["task-relations", "task-a"] as const;
    const targetKey = ["task-relations", "task-b"] as const;
    const projectKey = ["task-relations", "project", "project-1"] as const;
    const unrelated = ["tasks", "project-1"] as const;

    for (const key of [sourceKey, targetKey, projectKey, unrelated]) {
      client.setQueryData(key, [{ id: "cached" }]);
    }

    await client.invalidateQueries({ queryKey: ["task-relations"] });

    expect(client.getQueryState(sourceKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(targetKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(projectKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
  });
});

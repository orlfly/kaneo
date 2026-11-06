import { describe, expect, it } from "vitest";
import { getDependencyEndpoints } from "../../apps/api/src/task-relation/cycle";

describe("task relation dependency endpoints", () => {
  it("makes the target of a blocks relation wait for the source", () => {
    expect(
      getDependencyEndpoints({
        sourceTaskId: "blocker",
        targetTaskId: "blocked",
        relationType: "blocks",
      }),
    ).toEqual({
      dependentTaskId: "blocked",
      prerequisiteTaskId: "blocker",
    });
  });

  it("makes the parent of a subtask relation wait for the child", () => {
    expect(
      getDependencyEndpoints({
        sourceTaskId: "parent",
        targetTaskId: "child",
        relationType: "subtask",
      }),
    ).toEqual({
      dependentTaskId: "parent",
      prerequisiteTaskId: "child",
    });
  });

  it("does not treat related relations as dependencies", () => {
    expect(
      getDependencyEndpoints({
        sourceTaskId: "a",
        targetTaskId: "b",
        relationType: "related",
      }),
    ).toBeNull();
  });
});

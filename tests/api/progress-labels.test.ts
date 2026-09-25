import { describe, expect, it } from "vitest";
import {
  knownProgressToolNames,
  progressLabelFor,
} from "../../apps/api/src/chat/progress-labels";
import { toolDefinitions } from "../../apps/api/src/chat/tools";

describe("progress labels", () => {
  it("returns a labeled string for every tool name exposed to the agent", () => {
    const agentToolNames = toolDefinitions.map((tool) => tool.function.name);
    for (const name of agentToolNames) {
      const label = progressLabelFor(name);
      expect(label).toBeTruthy();
      expect(label).not.toBe("正在处理");
    }
  });

  it("falls back to a generic label for unknown tool names", () => {
    expect(progressLabelFor("does_not_exist")).toBe("正在处理");
  });

  it("exposes every labeled name through knownProgressToolNames", () => {
    const known = new Set(knownProgressToolNames());
    const agentToolNames = toolDefinitions.map((tool) => tool.function.name);
    for (const name of agentToolNames) {
      expect(known.has(name)).toBe(true);
    }
  });
});

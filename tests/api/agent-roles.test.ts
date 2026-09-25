import { describe, expect, it } from "vitest";
import {
  AGENT_ROLES,
  DEFAULT_AGENT_ROLE,
  isAgentRole,
} from "../../packages/permissions/src/index";

describe("agent role vocabulary", () => {
  it("defaults to coding when an agent key declares no role", () => {
    expect(DEFAULT_AGENT_ROLE).toBe("coding");
  });

  it("exposes all seven agent roles", () => {
    expect(AGENT_ROLES).toEqual([
      "coding",
      "product-design",
      "architecture-design",
      "devops",
      "ui-design",
      "testing",
      "code-review",
    ]);
  });

  it("treats the placeholder and empty values as not-agent-role", () => {
    expect(isAgentRole("")).toBe(false);
    expect(isAgentRole(null)).toBe(false);
    expect(isAgentRole("design")).toBe(false);
  });
});

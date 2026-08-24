import { describe, expect, it } from "vitest";
import {
  AGENT_ROLES,
  type AgentRole,
  DEFAULT_AGENT_ROLE,
  DEFAULT_TEAM_ROLE,
  isAgentRole,
  isTeamRole,
  TEAM_ROLES,
  type TeamRole,
} from "./index";

describe("@kaneo/permissions team roles", () => {
  it("exposes only the two fixed team roles", () => {
    expect([...TEAM_ROLES].sort()).toEqual(["member", "owner"]);
  });

  it("defaults new memberships to the least-privileged role", () => {
    expect(DEFAULT_TEAM_ROLE).toBe("member");
  });

  it("narrows unknown strings and non-strings", () => {
    expect(isTeamRole("owner")).toBe(true);
    expect(isTeamRole("member")).toBe(true);
    expect(isTeamRole("viewer")).toBe(false);
    expect(isTeamRole("")).toBe(false);
    expect(isTeamRole(null)).toBe(false);
    expect(isTeamRole({ role: "owner" } satisfies { role: TeamRole })).toBe(
      false,
    );
  });
});

describe("@kaneo/permissions agent roles", () => {
  it("exposes exactly the seven supported agent roles", () => {
    expect([...AGENT_ROLES]).toEqual([
      "coding",
      "product-design",
      "architecture-design",
      "devops",
      "ui-design",
      "testing",
      "code-review",
    ]);
  });

  it("defaults agents to the coding role", () => {
    expect(DEFAULT_AGENT_ROLE).toBe("coding");
  });

  it("accepts every role in the vocabulary", () => {
    for (const role of AGENT_ROLES) {
      expect(isAgentRole(role)).toBe(true);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isAgentRole("design")).toBe(false);
    expect(isAgentRole("")).toBe(false);
    expect(isAgentRole(null)).toBe(false);
    expect(isAgentRole({ role: "testing" } satisfies { role: AgentRole })).toBe(
      false,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEAM_ROLE,
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

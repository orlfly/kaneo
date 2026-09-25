import { describe, expect, it } from "vitest";
import {
  formatBlockedTeamsMessage,
  hasOwnerRole,
  planAccountDeletion,
  type TeamMembershipSummary,
} from "../../../apps/api/src/user/account-deletion";

function membership(
  overrides: Partial<TeamMembershipSummary> = {},
): TeamMembershipSummary {
  return {
    teamId: "team-1",
    teamName: "Acme",
    isOwner: true,
    memberCount: 1,
    ownerCount: 1,
    ...overrides,
  };
}

describe("hasOwnerRole", () => {
  it("matches a plain owner role", () => {
    expect(hasOwnerRole("owner")).toBe(true);
  });

  it("matches owner inside a comma separated role list", () => {
    expect(hasOwnerRole("admin,owner")).toBe(true);
    expect(hasOwnerRole("member, Owner ")).toBe(true);
  });

  it("does not match other roles", () => {
    expect(hasOwnerRole("admin")).toBe(false);
    expect(hasOwnerRole("ownership")).toBe(false);
  });
});

describe("planAccountDeletion", () => {
  it("deletes a team nobody else belongs to", () => {
    const plan = planAccountDeletion([membership()]);

    expect(plan.teamIdsToDelete).toEqual(["team-1"]);
    expect(plan.teamIdsToLeave).toEqual([]);
    expect(plan.blockedTeamNames).toEqual([]);
  });

  it("blocks when the account is the only owner of a shared team", () => {
    const plan = planAccountDeletion([
      membership({ memberCount: 3, ownerCount: 1 }),
    ]);

    expect(plan.blockedTeamNames).toEqual(["Acme"]);
    expect(plan.teamIdsToDelete).toEqual([]);
    expect(plan.teamIdsToLeave).toEqual([]);
  });

  it("leaves a shared team that keeps another owner", () => {
    const plan = planAccountDeletion([
      membership({ memberCount: 3, ownerCount: 2 }),
    ]);

    expect(plan.teamIdsToLeave).toEqual(["team-1"]);
    expect(plan.blockedTeamNames).toEqual([]);
  });

  it("leaves teams the account does not own", () => {
    const plan = planAccountDeletion([
      membership({ isOwner: false, memberCount: 4, ownerCount: 1 }),
    ]);

    expect(plan.teamIdsToLeave).toEqual(["team-1"]);
  });

  it("plans each team independently", () => {
    const plan = planAccountDeletion([
      membership({ teamId: "solo" }),
      membership({
        teamId: "shared",
        teamName: "Shared",
        memberCount: 2,
        ownerCount: 1,
      }),
      membership({
        teamId: "guest",
        isOwner: false,
        memberCount: 5,
        ownerCount: 1,
      }),
    ]);

    expect(plan.teamIdsToDelete).toEqual(["solo"]);
    expect(plan.blockedTeamNames).toEqual(["Shared"]);
    expect(plan.teamIdsToLeave).toEqual(["guest"]);
  });

  it("returns an empty plan for an account without teams", () => {
    expect(planAccountDeletion([])).toEqual({
      blockedTeamNames: [],
      teamIdsToDelete: [],
      teamIdsToLeave: [],
    });
  });
});

describe("formatBlockedTeamsMessage", () => {
  it("names a single team", () => {
    expect(formatBlockedTeamsMessage(["Acme"])).toBe(
      'You are the only owner of "Acme". Transfer ownership or delete it before deleting your account.',
    );
  });

  it("joins several teams", () => {
    expect(formatBlockedTeamsMessage(["Acme", "Globex", "Initech"])).toBe(
      'You are the only owner of "Acme", "Globex" and "Initech". Transfer ownership or delete them before deleting your account.',
    );
  });
});

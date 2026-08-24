// Fixed team roles. We do not expose an editable role matrix on top of teams:
// `owner` has full management of the team (and therefore its projects) while
// `member` participates in projects they belong to.
//
// The role names are kept as a plain string union so they are easy to compare
// in middleware without leaking the better-auth organization plugin into every
// consumer.

export type TeamRole = "owner" | "member";

export const TEAM_ROLES: readonly TeamRole[] = ["owner", "member"] as const;

export const DEFAULT_TEAM_ROLE: TeamRole = "member";

export function isTeamRole(value: unknown): value is TeamRole {
  return (
    typeof value === "string" &&
    (TEAM_ROLES as readonly string[]).includes(value)
  );
}

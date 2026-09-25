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

// Agent roles describe which specialist an AI agent claims to be when it
// picks up tasks. They are orthogonal to team roles: an agent role only
// narrows which tasks an agent may claim, it never changes team ownership.
// `coding` is the default so pre-existing agents keep claiming generic work.
export type AgentRole =
  | "coding" // 代码开发
  | "product-design" // 产品设计
  | "architecture-design" // 架构设计
  | "devops" // 运维管理
  | "ui-design" // 界面设计
  | "testing" // 测试
  | "code-review"; // 代码评审

export const AGENT_ROLES: readonly AgentRole[] = [
  "coding",
  "product-design",
  "architecture-design",
  "devops",
  "ui-design",
  "testing",
  "code-review",
] as const;

export const DEFAULT_AGENT_ROLE: AgentRole = "coding";

export function isAgentRole(value: unknown): value is AgentRole {
  return (
    typeof value === "string" &&
    (AGENT_ROLES as readonly string[]).includes(value)
  );
}

// `human` is a marker for the `required_role` column. It is NOT an agent role
// and MUST NOT be assignable as `metadata.agentRole` on an API key. The value
// exists so that a task can be reserved for a human team member to claim
// manually, instead of being picked up by an agent.
export const HUMAN_REQUIRED_ROLE = "human" as const;
export type HumanRequiredRole = typeof HUMAN_REQUIRED_ROLE;

/**
 * The shape of any `requiredRole` value: either one of the seven agent roles,
 * the `human` marker, or `null` (generic task that any agent may claim).
 */
export type TaskRequiredRole = AgentRole | HumanRequiredRole | null;

export function isHumanRequiredRole(
  value: unknown,
): value is HumanRequiredRole {
  return value === HUMAN_REQUIRED_ROLE;
}

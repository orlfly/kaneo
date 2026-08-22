export type TeamMembershipSummary = {
  teamId: string;
  teamName: string;
  isOwner: boolean;
  memberCount: number;
  ownerCount: number;
};

export type AccountDeletionPlan = {
  blockedTeamNames: string[];
  teamIdsToDelete: string[];
  teamIdsToLeave: string[];
};

export function hasOwnerRole(role: string) {
  return role
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .includes("owner");
}

export function planAccountDeletion(
  memberships: TeamMembershipSummary[],
): AccountDeletionPlan {
  const plan: AccountDeletionPlan = {
    blockedTeamNames: [],
    teamIdsToDelete: [],
    teamIdsToLeave: [],
  };

  for (const membership of memberships) {
    if (membership.memberCount <= 1) {
      plan.teamIdsToDelete.push(membership.teamId);
      continue;
    }

    if (membership.isOwner && membership.ownerCount <= 1) {
      plan.blockedTeamNames.push(membership.teamName);
      continue;
    }

    plan.teamIdsToLeave.push(membership.teamId);
  }

  return plan;
}

export function formatBlockedTeamsMessage(names: string[]) {
  const quoted = names.map((name) => `"${name}"`);
  const list =
    quoted.length === 1
      ? quoted[0]
      : `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;

  return `You are the only owner of ${list}. Transfer ownership or delete ${names.length === 1 ? "it" : "them"} before deleting your account.`;
}

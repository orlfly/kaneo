import { APIError } from "better-auth/api";
import { and, eq, inArray } from "drizzle-orm";
import db from "../../database";
import { teamMemberTable, teamTable } from "../../database/schema";
import {
  formatBlockedTeamsMessage,
  hasOwnerRole,
  planAccountDeletion,
  type TeamMembershipSummary,
} from "../account-deletion";

async function collectMemberships(
  userId: string,
): Promise<TeamMembershipSummary[]> {
  const memberships = await db
    .select({
      teamId: teamMemberTable.teamId,
      role: teamMemberTable.role,
    })
    .from(teamMemberTable)
    .where(eq(teamMemberTable.userId, userId));

  if (memberships.length === 0) {
    return [];
  }

  const teamIds = memberships.map((membership) => membership.teamId);

  const members = await db
    .select({
      teamId: teamMemberTable.teamId,
      teamName: teamTable.name,
      role: teamMemberTable.role,
    })
    .from(teamMemberTable)
    .innerJoin(teamTable, eq(teamMemberTable.teamId, teamTable.id))
    .where(inArray(teamMemberTable.teamId, teamIds));

  return memberships.map((membership) => {
    const teamMembers = members.filter(
      (member) => member.teamId === membership.teamId,
    );

    return {
      teamId: membership.teamId,
      teamName: teamMembers[0]?.teamName ?? "team",
      isOwner: hasOwnerRole(membership.role),
      memberCount: teamMembers.length,
      ownerCount: teamMembers.filter((member) => hasOwnerRole(member.role))
        .length,
    };
  });
}

export async function deleteAccountData(userId: string) {
  const plan = planAccountDeletion(await collectMemberships(userId));

  if (plan.blockedTeamNames.length > 0) {
    throw new APIError("CONFLICT", {
      message: formatBlockedTeamsMessage(plan.blockedTeamNames),
    });
  }

  if (plan.teamIdsToDelete.length > 0) {
    await db
      .delete(teamTable)
      .where(inArray(teamTable.id, plan.teamIdsToDelete));
  }

  if (plan.teamIdsToLeave.length > 0) {
    await db
      .delete(teamMemberTable)
      .where(
        and(
          eq(teamMemberTable.userId, userId),
          inArray(teamMemberTable.teamId, plan.teamIdsToLeave),
        ),
      );
  }

  return plan;
}

export default deleteAccountData;

import {
  addTeamMember,
  listTeamMembers,
  listTeamsForUser,
  removeTeamMember,
  updateTeamMemberRole,
} from "../../team/controllers";

export async function listUserTeams(userId: string) {
  return listTeamsForUser(userId);
}

export async function listMembersForTeam(teamId: string) {
  return listTeamMembers(teamId);
}

export async function addUserToTeam(
  userId: string,
  teamId: string,
  role: "owner" | "member" = "member",
) {
  return addTeamMember(teamId, userId, role);
}

export async function removeUserFromTeam(userId: string, teamId: string) {
  return removeTeamMember(teamId, userId);
}

export async function changeTeamMemberRole(
  teamId: string,
  userId: string,
  role: "owner" | "member",
) {
  return updateTeamMemberRole(teamId, userId, role);
}

export default {
  listUserTeams,
  listMembersForTeam,
  addUserToTeam,
  removeUserFromTeam,
  changeTeamMemberRole,
};

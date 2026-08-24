import { client } from "@kaneo/libs";

export type UpdateTeamMemberRoleInput = {
  teamId: string;
  userId: string;
  role: "owner" | "member";
};

async function updateTeamMemberRole(input: UpdateTeamMemberRoleInput) {
  const response = await client.team[":teamId"].members[":userId"].$patch({
    param: { teamId: input.teamId, userId: input.userId },
    json: { role: input.role },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(body.message || "Failed to update team member role");
  }

  return response.json();
}

export default updateTeamMemberRole;

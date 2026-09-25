import { client } from "@kaneo/libs";

type UpdateTeamMemberRoleInput = {
  teamId: string;
  userId: string;
  role: "owner" | "member";
};

async function updateTeamMemberRole(input: UpdateTeamMemberRoleInput) {
  const response = await client.admin.teams[":teamId"].members[
    ":userId"
  ].$patch({
    param: { teamId: input.teamId, userId: input.userId },
    json: { role: input.role },
  });

  if (!response.ok) {
    const body =
      (await response.text().catch(() => "")) || "Failed to update member role";
    throw new Error(body);
  }

  return response.json();
}

export default updateTeamMemberRole;

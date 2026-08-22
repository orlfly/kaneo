import { client } from "@kaneo/libs";

type RemoveUserFromTeamInput = {
  userId: string;
  teamId: string;
};

async function removeUserFromTeam(input: RemoveUserFromTeamInput) {
  const response = await client.admin.users[":id"].teams[":teamId"].$delete({
    param: { id: input.userId, teamId: input.teamId },
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")) || "Failed to remove user from team";
    throw new Error(body);
  }

  return response.json();
}

export default removeUserFromTeam;

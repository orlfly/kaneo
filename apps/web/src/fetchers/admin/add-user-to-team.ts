import { client } from "@kaneo/libs";

type AddUserToTeamInput = {
  userId: string;
  teamId: string;
  role?: "owner" | "member";
};

async function addUserToTeam(input: AddUserToTeamInput) {
  const response = await client.admin.users[":id"].teams[":teamId"].$post({
    param: { id: input.userId, teamId: input.teamId },
    json: { role: input.role ?? "member" },
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")) || "Failed to add user to team";
    throw new Error(body);
  }

  return response.json();
}

export default addUserToTeam;

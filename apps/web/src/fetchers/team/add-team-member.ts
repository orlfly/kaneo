import { client } from "@kaneo/libs";

export type AddTeamMemberInput = {
  teamId: string;
  userId: string;
  role?: "owner" | "member";
};

async function addTeamMember(input: AddTeamMemberInput) {
  const response = await client.team[":teamId"].members.$post({
    param: { teamId: input.teamId },
    json: {
      userId: input.userId,
      role: input.role ?? "member",
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(body.message || "Failed to add team member");
  }

  return response.json();
}

export default addTeamMember;
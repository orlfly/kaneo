import { client } from "@kaneo/libs";

async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const response = await client.team[":teamId"].members[":userId"].$delete({
    param: { teamId, userId },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(body.message || "Failed to remove team member");
  }
}

export default removeTeamMember;

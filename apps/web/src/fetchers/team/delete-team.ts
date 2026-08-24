import { client } from "@kaneo/libs";

async function deleteTeam(teamId: string): Promise<void> {
  const response = await client.team[":teamId"].$delete({
    param: { teamId },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(body.message || "Failed to delete team");
  }
}

export default deleteTeam;

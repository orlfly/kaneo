import { client } from "@kaneo/libs";

async function getActiveTeamId(): Promise<string | null> {
  const response = await client.team.active.$get();

  if (!response.ok) {
    throw new Error("Failed to get active team");
  }

  const data = await response.json();
  return data.teamId;
}

export default getActiveTeamId;

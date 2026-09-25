import { client } from "@kaneo/libs";

export type UpdateTeamInput = {
  teamId: string;
  name?: string;
};

async function updateTeam({ teamId, ...body }: UpdateTeamInput) {
  const response = await client.team[":teamId"].$put({
    param: { teamId },
    json: {
      name: body.name,
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(errorBody.message || "Failed to update team");
  }

  return response.json();
}

export default updateTeam;

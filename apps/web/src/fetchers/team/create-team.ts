import { client } from "@kaneo/libs";

export type CreateTeamInput = {
  name: string;
};

export type CreateTeamResponse = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: "owner" | "member";
  memberCount: number;
  createdAt: string;
  archivedAt: string | null;
};

async function createTeam(input: CreateTeamInput): Promise<CreateTeamResponse> {
  const response = await client.team.$post({
    json: { name: input.name },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(errorBody.message || "Failed to create team");
  }

  return (await response.json()) as CreateTeamResponse;
}

export default createTeam;

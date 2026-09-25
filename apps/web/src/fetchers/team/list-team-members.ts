import { client } from "@kaneo/libs";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "owner" | "member";
  joinedAt: string;
};

async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const response = await client.team[":teamId"].members.$get({
    param: { teamId },
  });

  if (!response.ok) {
    throw new Error("Failed to list team members");
  }

  return (await response.json()) as TeamMember[];
}

export default listTeamMembers;

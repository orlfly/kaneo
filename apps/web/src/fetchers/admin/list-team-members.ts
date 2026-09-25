import { client } from "@kaneo/libs";

export type AdminTeamMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "owner" | "member";
  joinedAt: string;
};

async function listTeamMembers(teamId: string): Promise<AdminTeamMember[]> {
  const response = await client.admin.teams[":teamId"].members.$get({
    param: { teamId },
  });

  if (!response.ok) {
    const body =
      (await response.text().catch(() => "")) || "Failed to list team members";
    throw new Error(body);
  }

  const data = (await response.json()) as { members: AdminTeamMember[] };
  return data.members;
}

export default listTeamMembers;

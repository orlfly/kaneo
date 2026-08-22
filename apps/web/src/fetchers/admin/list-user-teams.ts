import { client } from "@kaneo/libs";

export type AdminUserTeam = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "member";
  memberCount: number;
  createdAt: string;
  archivedAt: string | null;
};

async function listUserTeams(userId: string): Promise<AdminUserTeam[]> {
  const response = await client.admin.users[":id"].teams.$get({
    param: { id: userId },
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")) || "Failed to load teams";
    throw new Error(body);
  }

  const data = await response.json();
  return data.teams as AdminUserTeam[];
}

export default listUserTeams;

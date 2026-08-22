import { client } from "@kaneo/libs";

export type ListTeamsResponse = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: "owner" | "member";
  memberCount: number;
  createdAt: string;
  archivedAt: string | null;
};

type ListTeamsQuery = {
  includeArchived?: boolean;
};

async function listTeams(
  query: ListTeamsQuery = {},
): Promise<ListTeamsResponse[]> {
  const response = await client.team.$get({
    query: {
      includeArchived: query.includeArchived ? "true" : undefined,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to list teams");
  }

  return (await response.json()) as ListTeamsResponse[];
}

export default listTeams;
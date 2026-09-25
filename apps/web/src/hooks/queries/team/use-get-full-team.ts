import { useQuery } from "@tanstack/react-query";
import listTeamMembers, {
  type TeamMember,
} from "@/fetchers/team/list-team-members";
import listTeams from "@/fetchers/team/list-teams";

export type FullTeam = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: "owner" | "member";
  memberCount: number;
  createdAt: string;
  archivedAt: string | null;
  members: TeamMember[];
};

type GetFullTeamRequest = {
  teamId?: string;
};

function useGetFullTeam({ teamId }: GetFullTeamRequest) {
  return useQuery<FullTeam>({
    queryKey: ["team", "full", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      if (!teamId) throw new Error("teamId is required");
      const teams = await listTeams({});
      const team = teams.find((t) => t.id === teamId);
      if (!team) throw new Error("Team not found");
      const members = await listTeamMembers(teamId);
      return { ...team, members };
    },
  });
}

export default useGetFullTeam;

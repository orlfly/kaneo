import { useQuery } from "@tanstack/react-query";
import listTeamMembers, { type TeamMember } from "@/fetchers/team/list-team-members";

export function useGetActiveTeamMembers(teamId: string) {
  return useQuery<TeamMember[]>({
    queryKey: ["team-members", teamId],
    queryFn: () => listTeamMembers(teamId),
    enabled: !!teamId,
  });
}
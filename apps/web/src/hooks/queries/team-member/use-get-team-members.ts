import { useQuery } from "@tanstack/react-query";
import listTeamMembers, {
  type TeamMember,
} from "@/fetchers/team/list-team-members";

type GetTeamMembersRequest = {
  teamId?: string;
};

function useGetTeamMembers({ teamId }: GetTeamMembersRequest) {
  return useQuery<TeamMember[]>({
    queryKey: ["team-members", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      if (!teamId) return [];
      return listTeamMembers(teamId);
    },
  });
}

export default useGetTeamMembers;

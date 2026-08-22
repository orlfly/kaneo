import { useQuery } from "@tanstack/react-query";
import listTeamMembers, {
  type AdminTeamMember,
} from "@/fetchers/admin/list-team-members";

function useAdminTeamMembers(teamId: string | null) {
  return useQuery<AdminTeamMember[]>({
    queryKey: ["admin", "team-members", teamId],
    enabled: !!teamId,
    queryFn: () => {
      if (!teamId) throw new Error("teamId is required");
      return listTeamMembers(teamId);
    },
  });
}

export default useAdminTeamMembers;

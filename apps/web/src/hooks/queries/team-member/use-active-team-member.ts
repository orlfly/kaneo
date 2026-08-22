import { useQuery } from "@tanstack/react-query";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import useActiveTeam from "@/hooks/queries/team/use-active-team";
import listTeamMembers, { type TeamMember } from "@/fetchers/team/list-team-members";

function useGetActiveTeamMember() {
  const { user } = useAuth();
  const { data: team } = useActiveTeam();

  return useQuery<TeamMember | null>({
    queryKey: ["team-member", "active", team?.id, user?.id],
    enabled: !!team?.id && !!user?.id,
    queryFn: async () => {
      if (!team?.id || !user?.id) return null;
      const members = await listTeamMembers(team.id);
      return members.find((member) => member.id === user.id) ?? null;
    },
  });
}

export default useGetActiveTeamMember;
export { useGetActiveTeamMember };
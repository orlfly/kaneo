import { useMutation, useQueryClient } from "@tanstack/react-query";
import removeTeamMember from "@/fetchers/team/remove-team-member";

type DeleteTeamMemberRequest = {
  teamId: string;
  userId: string;
};

function useDeleteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId }: DeleteTeamMemberRequest) => {
      await removeTeamMember(teamId, userId);
    },
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: ["team-invites", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team", "full", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-members", teamId] });
    },
  });
}

export default useDeleteTeamMember;

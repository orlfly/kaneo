import { useMutation, useQueryClient } from "@tanstack/react-query";
import removeUserFromTeam from "@/fetchers/admin/remove-user-from-team";
import { toast } from "@/lib/toast";

type RemoveUserFromTeamInput = {
  userId: string;
  teamId: string;
};

function useAdminRemoveUserFromTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RemoveUserFromTeamInput) => removeUserFromTeam(input),
    onSuccess: (_, { userId, teamId }) => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "user-teams", userId],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin", "team-members", teamId],
      });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed");
    },
  });
}

export default useAdminRemoveUserFromTeam;

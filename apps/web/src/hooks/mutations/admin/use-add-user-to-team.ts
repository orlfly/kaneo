import { useMutation, useQueryClient } from "@tanstack/react-query";
import addUserToTeam from "@/fetchers/admin/add-user-to-team";
import { toast } from "@/lib/toast";

type AddUserToTeamInput = {
  userId: string;
  teamId: string;
  role?: "owner" | "member";
};

function useAdminAddUserToTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddUserToTeamInput) => addUserToTeam(input),
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

export default useAdminAddUserToTeam;

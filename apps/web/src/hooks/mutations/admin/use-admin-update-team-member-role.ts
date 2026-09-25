import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTeamMemberRole from "@/fetchers/admin/update-team-member-role";
import { toast } from "@/lib/toast";

type UpdateRoleInput = {
  teamId: string;
  userId: string;
  role: "owner" | "member";
};

function useAdminUpdateTeamMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRoleInput) => updateTeamMemberRole(input),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "team-members", teamId],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed");
    },
  });
}

export default useAdminUpdateTeamMemberRole;

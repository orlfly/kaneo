import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTeamMemberRole from "@/fetchers/team/update-team-member-role";

type UpdateTeamMemberRoleRequest = {
  teamId: string;
  userId: string;
  role: "owner" | "member";
};

function useUpdateTeamMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      teamId,
      userId,
      role,
    }: UpdateTeamMemberRoleRequest) =>
      updateTeamMemberRole({ teamId, userId, role }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["team", "full", variables.teamId],
      });
      queryClient.invalidateQueries({
        queryKey: ["team-members", variables.teamId],
      });
      queryClient.invalidateQueries({
        queryKey: ["team-member", "active"],
      });
    },
  });
}

export default useUpdateTeamMemberRole;
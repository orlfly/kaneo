import { useMutation } from "@tanstack/react-query";
import updateTeam from "@/fetchers/team/update-team";

type UpdateTeamRequest = {
  teamId: string;
  name?: string;
};

function useUpdateTeam() {
  return useMutation({
    mutationFn: async ({ teamId, name }: UpdateTeamRequest) =>
      updateTeam({ teamId, name }),
  });
}

export default useUpdateTeam;

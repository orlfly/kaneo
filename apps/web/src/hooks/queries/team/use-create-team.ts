import { useMutation } from "@tanstack/react-query";
import createTeam from "@/fetchers/team/create-team";

type CreateTeamRequest = {
  name: string;
};

function useCreateTeam() {
  return useMutation({
    mutationFn: async ({ name }: CreateTeamRequest) => createTeam({ name }),
  });
}

export default useCreateTeam;

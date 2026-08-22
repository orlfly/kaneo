import { client } from "@kaneo/libs";
import { useMutation } from "@tanstack/react-query";

type DeleteTeamRequest = {
  teamId: string;
};

function useDeleteTeam() {
  return useMutation({
    mutationFn: async ({ teamId }: DeleteTeamRequest) => {
      const response = await client.team[":teamId"].$delete({
        param: { teamId },
      });

      if (!response.ok) {
        throw new Error("Failed to delete team");
      }

      return response.json();
    },
  });
}

export default useDeleteTeam;

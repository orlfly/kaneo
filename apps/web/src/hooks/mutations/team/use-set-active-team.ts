import { client } from "@kaneo/libs";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type SetActiveTeamRequest = {
  teamId: string;
};

function useSetActiveTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId }: SetActiveTeamRequest) => {
      const response = await client.team.active.$put({
        json: { teamId },
      });
      if (!response.ok) {
        throw new Error("Failed to set active team");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      // ["teams", "active"] lives under the same prefix; invalidating with
      // the prefix above already refetches it, but be explicit for clarity.
      queryClient.invalidateQueries({ queryKey: ["teams", "active"] });
    },
  });
}

export default useSetActiveTeam;

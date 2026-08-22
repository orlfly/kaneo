import { useQuery } from "@tanstack/react-query";
import getLabelsByTeam from "@/fetchers/label/get-labels-by-team";

function useGetLabelsByTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: ["labels", "team", teamId],
    enabled: !!teamId,
    queryFn: () => getLabelsByTeam({ teamId: teamId as string }),
  });
}

export default useGetLabelsByTeam;
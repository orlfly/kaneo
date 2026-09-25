import { useQuery } from "@tanstack/react-query";
import listTeams, { type ListTeamsResponse } from "@/fetchers/team/list-teams";

function useGetTeams() {
  return useQuery<ListTeamsResponse[]>({
    queryKey: ["teams"],
    queryFn: () => listTeams({}),
  });
}

export default useGetTeams;

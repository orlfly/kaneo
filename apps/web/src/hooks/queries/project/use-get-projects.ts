import { useQuery } from "@tanstack/react-query";
import getProjects from "@/fetchers/project/get-projects";

function useGetProjects({ teamId }: { teamId: string }) {
  return useQuery({
    queryFn: () => getProjects({ teamId }),
    queryKey: ["projects", teamId],
    enabled: !!teamId,
  });
}

export default useGetProjects;

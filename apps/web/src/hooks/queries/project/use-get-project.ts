import { useQuery } from "@tanstack/react-query";
import getProject from "@/fetchers/project/get-project";

function useGetProject({ id, teamId }: { id: string; teamId: string }) {
  return useQuery({
    queryFn: () => getProject({ id, teamId }),
    queryKey: ["projects", teamId, id],
    enabled: !!id,
  });
}

export default useGetProject;

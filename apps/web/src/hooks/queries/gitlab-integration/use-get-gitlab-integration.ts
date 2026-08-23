import { useQuery } from "@tanstack/react-query";
import getGitLabIntegration from "@/fetchers/gitlab-integration/get-gitlab-integration";

function useGetGitLabIntegration(projectId: string) {
  return useQuery({
    queryKey: ["gitlab-integration", projectId],
    queryFn: () => getGitLabIntegration(projectId),
    enabled: !!projectId,
  });
}

export default useGetGitLabIntegration;

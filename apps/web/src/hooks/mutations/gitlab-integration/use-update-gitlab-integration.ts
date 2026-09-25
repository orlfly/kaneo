import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateGitLabIntegration, {
  type UpdateGitLabIntegrationRequest,
} from "@/fetchers/gitlab-integration/update-gitlab-integration";

export function useUpdateGitLabIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      json,
    }: {
      projectId: string;
      json: UpdateGitLabIntegrationRequest;
    }) => updateGitLabIntegration(projectId, json),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["gitlab-integration", projectId],
      });
    },
  });
}

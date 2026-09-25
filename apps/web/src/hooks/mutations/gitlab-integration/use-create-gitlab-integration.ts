import { useMutation, useQueryClient } from "@tanstack/react-query";
import createGitLabIntegration, {
  type CreateGitLabIntegrationRequest,
} from "@/fetchers/gitlab-integration/create-gitlab-integration";
import deleteGitLabIntegration from "@/fetchers/gitlab-integration/delete-gitlab-integration";
import verifyGitLabAccess, {
  type VerifyGitLabAccessRequest,
} from "@/fetchers/gitlab-integration/verify-gitlab-access";

export function useCreateGitLabIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: CreateGitLabIntegrationRequest;
    }) => createGitLabIntegration(projectId, data),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["gitlab-integration", projectId],
      });
    },
  });
}

export function useDeleteGitLabIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => deleteGitLabIntegration(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({
        queryKey: ["gitlab-integration", projectId],
      });
    },
  });
}

export function useVerifyGitLabAccess() {
  return useMutation({
    mutationFn: (data: VerifyGitLabAccessRequest) => verifyGitLabAccess(data),
  });
}

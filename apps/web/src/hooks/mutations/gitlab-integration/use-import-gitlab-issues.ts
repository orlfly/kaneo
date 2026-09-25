import { useMutation, useQueryClient } from "@tanstack/react-query";
import importGitLabIssues from "@/fetchers/gitlab-integration/import-gitlab-issues";

export default function useImportGitLabIssues() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => importGitLabIssues(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });
}

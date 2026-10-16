import { useQuery } from "@tanstack/react-query";
import getProjectTaskRelations from "@/fetchers/task-relation/get-project-task-relations";

/**
 * Relations for a whole project, keyed under the shared `task-relations` prefix
 * so a TASK_RELATION_UPDATED broadcast invalidates it along with the per-task
 * queries.
 */
function useGetProjectTaskRelations(projectId: string) {
  return useQuery({
    queryKey: ["task-relations", "project", projectId],
    queryFn: () => getProjectTaskRelations(projectId),
    enabled: !!projectId,
  });
}

export default useGetProjectTaskRelations;

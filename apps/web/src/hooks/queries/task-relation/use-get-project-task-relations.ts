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
    // The app disables refetchOnMount globally. Relations change while this
    // view is closed — a subtask added from a task detail panel, a cascade
    // from a delete — and an invalidation only marks an inactive query stale,
    // so without this the list would reopen on the edges it last saw.
    refetchOnMount: true,
  });
}

export default useGetProjectTaskRelations;

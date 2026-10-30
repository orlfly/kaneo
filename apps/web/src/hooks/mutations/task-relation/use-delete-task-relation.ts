import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTaskRelation from "@/fetchers/task-relation/delete-task-relation";

import { invalidateRelationTaskProject } from "./invalidate-relation-task-project";

function useDeleteTaskRelation(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskRelation,
    onSuccess: (deleted) => {
      void invalidateRelationTaskProject(queryClient, deleted.sourceTaskId);
      // Both ends go stale, and only one of them is the task this hook was
      // opened for. Queries default to refetchOnMount: false, so opening the
      // other task would otherwise still list the relation.
      const endpoints = new Set([
        taskId,
        deleted.sourceTaskId,
        deleted.targetTaskId,
      ]);
      for (const endpoint of endpoints) {
        queryClient.invalidateQueries({
          queryKey: ["task-relations", endpoint],
        });
      }
      // The Gantt reads a project-wide edge list under this prefix, and the
      // list view reads relations per project rather than per task.
      queryClient.invalidateQueries({
        queryKey: ["task-relations"],
      });
    },
  });
}

export default useDeleteTaskRelation;

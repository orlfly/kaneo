import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTaskRelation from "@/fetchers/task-relation/delete-task-relation";

function useDeleteTaskRelation(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskRelation,
    onSuccess: (relation) => {
      // The deleted relation has two endpoints: the panel that removed it and
      // the panel of the task on the other side, which would otherwise keep
      // rendering a link that no longer exists.
      queryClient.invalidateQueries({
        queryKey: ["task-relations", taskId],
      });
      if (relation?.sourceTaskId) {
        queryClient.invalidateQueries({
          queryKey: ["task-relations", relation.sourceTaskId],
        });
      }
      if (relation?.targetTaskId) {
        queryClient.invalidateQueries({
          queryKey: ["task-relations", relation.targetTaskId],
        });
      }
      // The Gantt reads a project-wide edge list under this prefix, and realtime
      // is otherwise the only path that refreshes it.
      queryClient.invalidateQueries({
        queryKey: ["task-relations"],
      });
    },
  });
}

export default useDeleteTaskRelation;

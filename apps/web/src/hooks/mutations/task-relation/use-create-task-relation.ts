import { useMutation, useQueryClient } from "@tanstack/react-query";
import createTaskRelation from "@/fetchers/task-relation/create-task-relation";

function useCreateTaskRelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTaskRelation,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.sourceTaskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.targetTaskId],
      });
      // The Gantt reads a project-wide edge list under this prefix, and realtime
      // is otherwise the only path that refreshes it.
      queryClient.invalidateQueries({
        queryKey: ["task-relations"],
      });
    },
  });
}

export default useCreateTaskRelation;

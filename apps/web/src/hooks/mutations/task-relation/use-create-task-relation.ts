import { useMutation, useQueryClient } from "@tanstack/react-query";
import createTaskRelation from "@/fetchers/task-relation/create-task-relation";

import { invalidateRelationTaskProject } from "./invalidate-relation-task-project";

function useCreateTaskRelation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTaskRelation,
    onSuccess: (_, variables) => {
      void invalidateRelationTaskProject(queryClient, variables.sourceTaskId);
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.sourceTaskId],
      });
      queryClient.invalidateQueries({
        queryKey: ["task-relations", variables.targetTaskId],
      });
      // The Gantt reads a project-wide edge list under this prefix, and the
      // list view reads relations per project rather than per task; realtime is
      // otherwise the only path that refreshes them.
      queryClient.invalidateQueries({
        queryKey: ["task-relations"],
      });
    },
  });
}

export default useCreateTaskRelation;

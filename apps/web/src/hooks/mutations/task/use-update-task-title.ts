import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskTitle from "@/fetchers/task/update-task-title";
import {
  getBoardCacheVersion,
  markBoardCacheChanged,
} from "@/lib/board-cache-version";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { updateBoardTaskCache } from "@/lib/update-board-task-cache";
import type Task from "@/types/task";

export function useUpdateTaskTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) => updateTaskTitle(task.id, task),
    onMutate: (task: Task) => {
      markBoardCacheChanged(queryClient, task.projectId, task.id);
      return {
        version: getBoardCacheVersion(queryClient, task.projectId, task.id),
      };
    },
    onSuccess: (updated, variables, context) => {
      invalidateMyWork(queryClient);
      queryClient.invalidateQueries({
        queryKey: ["task", variables.id],
      });
      updateBoardTaskCache(
        queryClient,
        variables.projectId,
        variables.id,
        {
          title: updated.title,
        },
        context?.version,
      );
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.id],
      });
    },
  });
}

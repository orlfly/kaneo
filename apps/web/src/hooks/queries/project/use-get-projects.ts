import { useQuery } from "@tanstack/react-query";
import getProjects from "@/fetchers/project/get-projects";

function useGetProjects(
  {
    teamId,
    includeArchived = false,
    enabled = true,
  }: { teamId: string; includeArchived?: boolean; enabled?: boolean },
  refreshWhileVisible = false,
) {
  return useQuery({
    queryFn: () =>
      getProjects(
        includeArchived ? { teamId, includeArchived: "true" } : { teamId },
      ),
    queryKey: includeArchived
      ? ["projects", teamId, "including-archived"]
      : ["projects", teamId],
    enabled: enabled && !!teamId,
    // Home and the sidebar show statistics without a project socket.
    ...(refreshWhileVisible
      ? {
          refetchInterval: 30_000,
          refetchOnWindowFocus: "always" as const,
          refetchOnMount: "always" as const,
        }
      : {}),
  });
}

export default useGetProjects;

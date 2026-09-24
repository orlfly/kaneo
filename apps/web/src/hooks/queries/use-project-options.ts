import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import getProjects from "@/fetchers/project/get-projects";
import listTeams from "@/fetchers/team/list-teams";

export type ProjectOption = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
};

/**
 * All projects across the caller's teams, labeled with the team name, for
 * the API-key project binding selector. Archived teams are skipped.
 */
function useProjectOptions() {
  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => listTeams({}),
  });

  const activeTeams = useMemo(
    () => teams.filter((team) => !team.archivedAt),
    [teams],
  );

  const projectQueries = useQueries({
    queries: activeTeams.map((team) => ({
      queryKey: ["projects", team.id] as const,
      queryFn: () => getProjects({ teamId: team.id }),
      enabled: Boolean(team.id),
    })),
  });

  return useMemo<ProjectOption[]>(() => {
    const options: ProjectOption[] = [];
    activeTeams.forEach((team, index) => {
      const projects = projectQueries[index]?.data;
      if (!projects) return;
      for (const project of projects) {
        options.push({
          id: project.id,
          name: project.name,
          teamId: team.id,
          teamName: team.name,
        });
      }
    });
    return options;
  }, [activeTeams, projectQueries]);
}

export default useProjectOptions;

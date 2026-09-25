import { useQuery } from "@tanstack/react-query";
import getActiveTeamId from "@/fetchers/team/get-active-team-id";
import listTeams, { type ListTeamsResponse } from "@/fetchers/team/list-teams";

export type ActiveTeam = ListTeamsResponse;

function useActiveTeam() {
  // Resolves the persisted active team from the session. Falls back to the
  // first member team when no active selection exists yet (e.g. brand-new
  // accounts). The query key stays under ["teams"] so shared
  // invalidateQueries({ queryKey: ["teams"] }) calls cover it.
  return useQuery<ActiveTeam | null>({
    queryKey: ["teams", "active"],
    queryFn: async () => {
      const [teams, activeTeamId] = await Promise.all([
        listTeams({}),
        getActiveTeamId(),
      ]);
      if (activeTeamId) {
        const active = teams.find((team) => team.id === activeTeamId);
        if (active) return active;
      }
      return teams[0] ?? null;
    },
  });
}

export default useActiveTeam;

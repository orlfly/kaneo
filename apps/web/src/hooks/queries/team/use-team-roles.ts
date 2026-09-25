import { useQuery } from "@tanstack/react-query";

export type TeamRole = {
  id: string;
  teamId: string;
  role: string;
  permission: Record<string, string[]>;
  createdAt: string;
  updatedAt?: string | null;
};

// Custom team roles were removed when the organization plugin was
// dropped. The team model uses fixed `owner`/`member` roles only. This hook
// returns an empty list so callers that still read roles get a consistent
// shape.
function useTeamRoles(_teamId: string | undefined) {
  return useQuery<TeamRole[]>({
    queryKey: ["team-roles", _teamId],
    enabled: !!_teamId,
    queryFn: async () => [],
  });
}

export default useTeamRoles;

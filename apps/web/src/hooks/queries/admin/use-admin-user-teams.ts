import { useQuery } from "@tanstack/react-query";
import listUserTeams, {
  type AdminUserTeam,
} from "@/fetchers/admin/list-user-teams";

function useAdminUserTeams(userId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "user-teams", userId],
    enabled: !!userId,
    queryFn: () => listUserTeams(userId as string),
  });
}

export default useAdminUserTeams;
export type { AdminUserTeam };

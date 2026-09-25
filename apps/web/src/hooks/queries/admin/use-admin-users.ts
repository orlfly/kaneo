import { useQuery } from "@tanstack/react-query";
import listUsers from "@/fetchers/admin/list-users";

function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: listUsers,
  });
}

export default useAdminUsers;

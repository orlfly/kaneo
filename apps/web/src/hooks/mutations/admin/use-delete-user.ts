import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteUser from "@/fetchers/admin/delete-user";

function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export default useDeleteUser;

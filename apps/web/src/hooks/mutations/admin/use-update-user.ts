import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateUser, {
  type UpdateUserRequest,
} from "@/fetchers/admin/update-user";

function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      ...request
    }: UpdateUserRequest & { userId: string }) => updateUser(userId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export default useUpdateUser;

import { useMutation, useQueryClient } from "@tanstack/react-query";
import createUser, {
  type CreateUserRequest,
} from "@/fetchers/admin/create-user";

function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateUserRequest) => createUser(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export default useCreateUser;

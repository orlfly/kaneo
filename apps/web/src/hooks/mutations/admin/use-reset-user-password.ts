import { useMutation, useQueryClient } from "@tanstack/react-query";
import resetUserPassword from "@/fetchers/admin/reset-password";

function useResetUserPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      resetUserPassword(userId, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export default useResetUserPassword;

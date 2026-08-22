import { useMutation, useQueryClient } from "@tanstack/react-query";
import chatConfig, { type ChatConfig } from "@/fetchers/admin/chat-config";
import { toast } from "@/lib/toast";

function useUpdateChatConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChatConfig) => chatConfig.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "chat-config"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed");
    },
  });
}

export default useUpdateChatConfig;

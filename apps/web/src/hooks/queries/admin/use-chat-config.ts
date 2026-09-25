import { useQuery } from "@tanstack/react-query";
import chatConfig, { type ChatConfig } from "@/fetchers/admin/chat-config";

function useChatConfig() {
  return useQuery<ChatConfig>({
    queryKey: ["admin", "chat-config"],
    queryFn: chatConfig.list,
    retry: false,
  });
}

export default useChatConfig;
export type { ChatConfig };

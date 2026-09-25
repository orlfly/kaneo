import { useQuery } from "@tanstack/react-query";
import { type ChatMessage, listChatMessages } from "@/fetchers/project/chat";

function useChatMessages(projectId: string) {
  return useQuery<ChatMessage[]>({
    queryKey: ["chat-messages", projectId],
    enabled: !!projectId,
    queryFn: () => listChatMessages(projectId),
  });
}

export default useChatMessages;

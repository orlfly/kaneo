import { useQueryClient } from "@tanstack/react-query";
import { BotIcon, Paperclip, SendIcon, Trash2, UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "@/components/public-project/markdown-renderer";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ChatMessage,
  clearChatHistory,
  getChatStatus,
  streamChatMessage,
  uploadChatFile,
} from "@/fetchers/project/chat";
import useChatMessages from "@/hooks/queries/project/use-chat-messages";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type Props = {
  projectId: string;
};

type StreamingMessage = {
  id: string;
  role: "assistant";
  content: string;
  streaming: boolean;
};

function ChatPanel({ projectId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: messages = [], isLoading } = useChatMessages(projectId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingMsg, setStreamingMsg] = useState<StreamingMessage | null>(
    null,
  );
  const [enabled, setEnabled] = useState<boolean>(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScrollKey = useRef<string>("");

  const handleUpload = async (file: File) => {
    try {
      const result = await uploadChatFile(projectId, file);
      toast.success(
        t("chat:fileUploaded", {
          defaultValue: `Uploaded ${file.name} (${result.path})`,
        }),
      );
      setInput((prev) =>
        prev.trim()
          ? `${prev}\n\n上传的文件: ${result.path}`
          : `请分析上传的文件 ${result.path}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("chat:uploadError", { defaultValue: "Failed to upload file" }),
      );
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    e.target.value = "";
  };

  useEffect(() => {
    getChatStatus()
      .then((status) => setEnabled(status.enabled))
      .finally(() => setStatusLoaded(true));
  }, []);

  // Scroll to bottom on new content. We compute a stable key from message
  // count + streaming content so the effect re-runs at the right moments.
  const scrollKey = `${messages.length}:${streamingMsg?.content.length ?? 0}`;
  useEffect(() => {
    if (scrollKey === lastScrollKey.current) return;
    lastScrollKey.current = scrollKey;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scrollKey]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || streaming) return;
    if (statusLoaded && enabled === false) return;

    setInput("");
    setStreaming(true);
    const tempId = `streaming-${Date.now()}`;
    setStreamingMsg({
      id: tempId,
      role: "assistant",
      content: "",
      streaming: true,
    });

    abortRef.current = new AbortController();

    try {
      await streamChatMessage(
        projectId,
        content,
        (token) => {
          setStreamingMsg((prev) =>
            prev ? { ...prev, content: prev.content + token } : prev,
          );
        },
        abortRef.current.signal,
      );

      // Refresh message list from server
      await queryClient.invalidateQueries({
        queryKey: ["chat-messages", projectId],
      });
    } catch (error) {
      if (error instanceof Error && error.message === "not-enabled") {
        setEnabled(false);
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : t("chat:errorFailed", { defaultValue: "Failed to send message" }),
        );
      }
    } finally {
      setStreaming(false);
      setStreamingMsg(null);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearChatHistory(projectId);
      setConfirmClear(false);
      toast.success(
        t("chat:historyCleared", {
          defaultValue: "Chat history cleared",
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: ["chat-messages", projectId],
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("chat:historyClearError", {
              defaultValue: "Failed to clear chat history",
            }),
      );
    }
  };

  if (statusLoaded && !enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <BotIcon className="size-10 text-muted-foreground/40" />
        <h3 className="text-base font-semibold">
          {t("chat:notEnabledTitle", {
            defaultValue: "AI assistant not enabled",
          })}
        </h3>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("chat:notEnabledDescription", {
            defaultValue:
              "The pi-agent AI assistant has not been configured for this instance. Please contact an administrator to enable it.",
          })}
        </p>
      </div>
    );
  }

  const isNotConfigured = statusLoaded && !enabled;
  const chatDisabled = streaming || isNotConfigured;
  const sendDisabled = !input.trim() || chatDisabled;

  const allMessages: Array<ChatMessage | StreamingMessage> = [
    ...messages,
    ...(streamingMsg ? [streamingMsg] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading && allMessages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">
              {t("common:states.loading", { defaultValue: "Loading…" })}
            </span>
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <BotIcon className="size-10 text-primary/30" />
            <h3 className="text-base font-semibold">
              {t("chat:welcomeTitle", { defaultValue: "Chat with pi-agent" })}
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("chat:welcomeDescription", {
                defaultValue:
                  "Ask me to create tasks, check project status, or analyze progress. I'm your AI project management assistant.",
              })}
            </p>
          </div>
        ) : (
          allMessages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                msg.role === "user" && "flex-row-reverse",
              )}
            >
              <Avatar
                className={cn(
                  "size-7 shrink-0",
                  msg.role === "user" ? "bg-primary/10" : "bg-muted",
                )}
              >
                <AvatarFallback className="text-[10px]">
                  {msg.role === "user" ? (
                    <UserIcon className="size-3.5" />
                  ) : (
                    <BotIcon className="size-3.5" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="kaneo-tiptap-prose">
                    <MarkdownRenderer content={msg.content} />
                    {"streaming" in msg && msg.streaming && !msg.content ? (
                      <span className="inline-flex gap-1">
                        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
                        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50 [animation-delay:200ms]" />
                        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50 [animation-delay:400ms]" />
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t px-2.5 py-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onFileSelected}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={chatDisabled}
            title={t("chat:attachFile", { defaultValue: "Upload a file" })}
            aria-label={t("chat:attachFile", { defaultValue: "Upload a file" })}
          >
            <Paperclip className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => setConfirmClear(true)}
            disabled={chatDisabled || allMessages.length === 0}
            title={t("chat:clearHistory", {
              defaultValue: "Clear chat history",
            })}
            aria-label={t("chat:clearHistory", {
              defaultValue: "Clear chat history",
            })}
          >
            <Trash2 className="size-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("chat:placeholder", {
              defaultValue: "Send a message to pi-agent…",
            })}
            disabled={chatDisabled}
            className="h-11 flex-1"
          />
          <Button
            size="icon"
            className="size-11 shrink-0 rounded-lg"
            onClick={handleSend}
            disabled={sendDisabled}
            title={t("chat:send")}
            aria-label={t("chat:send")}
          >
            <SendIcon className="size-5" />
          </Button>
        </div>
        {streaming && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("chat:streaming", { defaultValue: "pi-agent is typing…" })}
          </p>
        )}
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("chat:clearHistoryTitle", {
                defaultValue: "Clear chat history?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("chat:clearHistoryDescription", {
                defaultValue:
                  "This permanently deletes the conversation with pi-agent for this project. This cannot be undone.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>{t("common:actions.cancel")}</AlertDialogClose>
            <Button variant="destructive" onClick={handleClearHistory}>
              {t("chat:clearHistoryConfirm", {
                defaultValue: "Clear history",
              })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ChatPanel;

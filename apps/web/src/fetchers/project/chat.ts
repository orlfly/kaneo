import { client } from "@kaneo/libs";

export type ChatMessage = {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export async function listChatMessages(
  projectId: string,
): Promise<ChatMessage[]> {
  const response = await client.chat.project[":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw new Error("Failed to load chat messages");
  }

  return response.json() as Promise<ChatMessage[]>;
}

export async function clearChatHistory(projectId: string): Promise<void> {
  const response = await client.chat.project[":projectId"].$delete({
    param: { projectId },
  });

  if (!response.ok) {
    throw new Error("Failed to clear chat history");
  }
}

/**
 * Resolves whether the pi-agent is configured. Uses the same API base URL as
 * the typed client, so it works behind Vite dev without a /api proxy.
 * Always bypasses the HTTP cache: this flips at runtime when an admin saves
 * the AI settings.
 */
export async function getChatStatus(): Promise<{ enabled: boolean }> {
  try {
    const response = await fetch(`${resolveApiBaseUrl()}/chat/status`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return { enabled: false };
    return response.json();
  } catch {
    return { enabled: false };
  }
}

export function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL || "http://localhost:1337";
  const baseUrl = raw.replace(/\/+$/, "");
  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
}

/**
 * Parses one SSE `data:` payload line from the chat stream.
 * Token chunks are plain text (data: 你好); the done event is a JSON object
 * (data: {"messageId":"..."}). Returns null for lines to skip (empty or
 * [DONE]), an object describing the payload otherwise.
 */
export function parseSSELine(
  trimmed: string,
): { kind: "token"; text: string } | { kind: "done" } | null {
  if (!trimmed.startsWith("data: ")) return null;
  const data = trimmed.slice(6);
  if (data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === "string") return { kind: "token", text: parsed };
    if (parsed && typeof parsed.messageId === "string") {
      return { kind: "done" };
    }
  } catch {
    // Not valid JSON: raw text token.
  }
  return { kind: "token", text: data };
}

/**
 * Stream a chat message via SSE. Calls onToken for each token chunk.
 * Returns the full assistant response.
 */
export async function streamChatMessage(
  projectId: string,
  content: string,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(
    `${resolveApiBaseUrl()}/chat/project/${projectId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content }),
      signal,
    },
  );

  if (response.status === 503) {
    throw new Error("not-enabled");
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || "Failed to send message");
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      const parsed = parseSSELine(trimmed);
      if (!parsed) continue;
      if (parsed.kind === "token") {
        fullContent += parsed.text;
        onToken(parsed.text);
      }
    }
  }

  return fullContent;
}

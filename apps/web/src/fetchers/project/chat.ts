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
 * Upload a file to the project's agent working directory. Returns the stored
 * relative path that pi-agent can read via agent_read_file.
 */
export async function uploadChatFile(
  projectId: string,
  file: File,
): Promise<{ path: string; bytes: number }> {
  const dataUrl = await fileToBase64(file);
  const response = await fetch(
    `${resolveApiBaseUrl()}/chat/project/${projectId}/upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        data: dataUrl,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || "Failed to upload file");
  }

  return response.json();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
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
 * Parses one SSE `data:` payload line from the chat stream. Token chunks are
 * plain text (data: 你好); the done event is a JSON object (data:
 * {"messageId":"..."}). Returns null for lines to skip (empty or [DONE]), an
 * object describing the payload otherwise.
 */
export function parseSSELine(
  trimmed: string,
):
  | { kind: "token"; text: string }
  | { kind: "done" }
  | { kind: "error"; message: string }
  | null {
  if (!trimmed.startsWith("data: ")) return null;
  const data = trimmed.slice(6);
  if (data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === "string") return { kind: "token", text: parsed };
    if (parsed && typeof parsed.messageId === "string") {
      return { kind: "done" };
    }
    if (parsed?.error && typeof parsed.error === "string") {
      return { kind: "error", message: parsed.error };
    }
  } catch {
    // Not valid JSON: raw text token.
  }
  return { kind: "token", text: data };
}

/**
 * One step emitted by pi-agent while it is working between tool calls. The
 * server puts the tool name and a human-readable label into the SSE event so
 * the chat panel can show what the agent is doing without exposing tool
 * arguments or results.
 */
export type ProgressEntry = {
  round: number;
  tool: string;
  label: string;
};

export type StreamChatResult = {
  content: string;
  progressLog: ProgressEntry[];
};

/**
 * Stream a chat message via SSE. Calls onToken for each token chunk and
 * onProgress for each progress event emitted between tool calls. Returns the
 * full assistant response and the progress log so the caller can render the
 * intermediate steps in the chat panel.
 */
export async function streamChatMessage(
  projectId: string,
  content: string,
  onToken: (token: string) => void,
  onProgress?: (entry: ProgressEntry) => void,
  signal?: AbortSignal,
): Promise<StreamChatResult> {
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
  let currentEvent = "message";
  const progressLog: ProgressEntry[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        // Blank line separates SSE events. Reset for the next event block.
        currentEvent = "message";
        continue;
      }
      if (trimmed.startsWith("event: ")) {
        currentEvent = trimmed.slice(7).trim();
        continue;
      }
      if (currentEvent === "progress") {
        const payload = trimmed.startsWith("data: ")
          ? trimmed.slice(6)
          : trimmed;
        try {
          const parsed = JSON.parse(payload);
          if (
            parsed &&
            typeof parsed.tool === "string" &&
            typeof parsed.label === "string"
          ) {
            const entry: ProgressEntry = {
              round: typeof parsed.round === "number" ? parsed.round : 0,
              tool: parsed.tool,
              label: parsed.label,
            };
            progressLog.push(entry);
            onProgress?.(entry);
          }
        } catch {
          // Ignore malformed progress payloads; they should never appear.
        }
        continue;
      }
      const parsed = parseSSELine(trimmed);
      if (!parsed) continue;
      if (parsed.kind === "token") {
        fullContent += parsed.text;
        onToken(parsed.text);
      } else if (parsed.kind === "error") {
        throw new Error(parsed.message);
      }
    }
  }

  return { content: fullContent, progressLog };
}

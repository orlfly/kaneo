// Minimal HTTP client for an OpenAI-compatible API (pi-agent).
// Reads configuration from the chat_config database row.

import { loadChatConfig } from "./config";

export async function isPiAgentConfigured(): Promise<boolean> {
  const config = await loadChatConfig();
  return Boolean(
    config.enabled && config.baseUrl.trim() && config.apiKey.trim(),
  );
}

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

export type ChatCompletionTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatCompletionResponse = {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: ChatCompletionMessage["tool_calls"];
    };
    finish_reason: string;
  }>;
};

export type StreamChunk = {
  choices: Array<{
    delta: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string | null;
  }>;
};

export function completionUrl(baseUrl: string): string {
  // The configured base may or may not include an OpenAI-style /v1
  // (e.g. "https://api.example.com" vs "https://opencode.ai/zen/go/v1").
  // Normalize so we never append a duplicate "/v1".
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

async function getConfig() {
  const config = await loadChatConfig();
  if (!config.enabled || !config.baseUrl.trim() || !config.apiKey.trim()) {
    throw new Error("pi-agent is not configured");
  }
  return config;
}

/**
 * Non-streaming completion for tool-call rounds.
 * Returns the full message including any tool_calls.
 */
export async function chatCompletion(
  messages: ChatCompletionMessage[],
  tools?: ChatCompletionTool[],
  model?: string,
): Promise<ChatCompletionResponse> {
  const config = await getConfig();

  const body: Record<string, unknown> = {
    model: (model ?? config.model) || "gpt-4o",
    messages,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(completionUrl(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`pi-agent request failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as ChatCompletionResponse;
}

/**
 * Streaming completion. Calls onToken for each content delta.
 * Returns the full accumulated content and any tool_calls from the final chunk.
 */
export async function chatCompletionStream(
  messages: ChatCompletionMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<{
  content: string;
  toolCalls: ChatCompletionMessage["tool_calls"];
}> {
  const config = await getConfig();

  const response = await fetch(completionUrl(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || "gpt-4o",
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`pi-agent stream failed: ${response.status} ${errorText}`);
  }

  if (!response.body) {
    throw new Error("pi-agent stream returned no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let toolCalls: ChatCompletionMessage["tool_calls"];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed?.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const chunk = JSON.parse(data) as StreamChunk;
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          onToken(delta.content);
        }
        if (delta?.tool_calls) {
          toolCalls = delta.tool_calls;
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  return { content: fullContent, toolCalls };
}

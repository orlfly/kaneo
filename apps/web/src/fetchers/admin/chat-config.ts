import { client } from "@kaneo/libs";

export type ChatConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  workdirRoot: string | null;
  enableCommandExecution: boolean;
  commandTimeoutMs: number;
};

async function listChatConfig(): Promise<ChatConfig> {
  const response = await client.chat.config.$get();
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || "Failed to load AI configuration");
  }
  return response.json();
}

async function updateChatConfig(input: ChatConfig): Promise<ChatConfig> {
  const response = await client.chat.config.$put({ json: input });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || "Failed to save AI configuration");
  }
  return response.json();
}

export default {
  list: listChatConfig,
  update: updateChatConfig,
};

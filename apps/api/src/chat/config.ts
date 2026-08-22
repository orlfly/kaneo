import { eq } from "drizzle-orm";
import db from "../database";
import { chatConfigTable } from "../database/schema";
import {
  decryptSecret,
  encryptSecret,
} from "../notification-preferences/secrets";

const CONFIG_ID = "default";

export type ChatConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export async function loadChatConfig(): Promise<ChatConfig> {
  const [row] = await db
    .select({
      enabled: chatConfigTable.enabled,
      baseUrl: chatConfigTable.baseUrl,
      apiKeyEncrypted: chatConfigTable.apiKeyEncrypted,
      model: chatConfigTable.model,
    })
    .from(chatConfigTable)
    .where(eq(chatConfigTable.id, CONFIG_ID))
    .limit(1);

  if (!row) {
    return { enabled: false, baseUrl: "", apiKey: "", model: "" };
  }

  let apiKey = "";
  const encrypted = row.apiKeyEncrypted;
  if (encrypted) {
    try {
      const decrypted = decryptSecret(encrypted);
      apiKey = decrypted ?? "";
    } catch {
      apiKey = "";
    }
  }

  return {
    enabled: row.enabled,
    baseUrl: row.baseUrl,
    apiKey,
    model: row.model,
  };
}

export async function isChatConfigured(): Promise<boolean> {
  const config = await loadChatConfig();
  return Boolean(
    config.enabled && config.baseUrl.trim() && config.apiKey.trim(),
  );
}

export async function saveChatConfig(input: {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<void> {
  const baseUrl = input.baseUrl.trim();
  const model = input.model.trim() || "gpt-4o";
  const trimmedApiKey = input.apiKey.trim();

  // The UI echoes a masked "********" placeholder for the stored key. Treat
  // that as "unchanged" so saving the form without retyping the secret keeps
  // the existing encrypted value. An empty string explicitly clears it.
  const keepExisting = shouldKeepExistingKey(trimmedApiKey);
  const newEncrypted = keepExisting ? null : encryptedOrNull(trimmedApiKey);

  // If the form kept the placeholder, preserve the stored secret.
  const resolvedApiKeyEncrypted =
    newEncrypted ?? (keepExisting ? await readStoredEncrypted() : null);

  await db
    .insert(chatConfigTable)
    .values({
      id: CONFIG_ID,
      enabled: input.enabled,
      baseUrl,
      apiKeyEncrypted: resolvedApiKeyEncrypted,
      model,
    })
    .onConflictDoUpdate({
      target: chatConfigTable.id,
      set: {
        enabled: input.enabled,
        baseUrl,
        apiKeyEncrypted: resolvedApiKeyEncrypted,
        model,
        updatedAt: new Date(),
      },
    });
}

// A masked placeholder (the UI echoes "********" instead of the stored
// secret) or an empty string means "leave the stored key unchanged".
export function shouldKeepExistingKey(apiKey: string): boolean {
  return apiKey === "********" || apiKey === "";
}

function encryptedOrNull(key: string): string | null {
  return encryptSecret(key) ?? null;
}

async function readStoredEncrypted(): Promise<string | null> {
  const [row] = await db
    .select({ apiKeyEncrypted: chatConfigTable.apiKeyEncrypted })
    .from(chatConfigTable)
    .where(eq(chatConfigTable.id, CONFIG_ID))
    .limit(1);
  return row?.apiKeyEncrypted ?? null;
}

export default {
  loadChatConfig,
  isChatConfigured,
  saveChatConfig,
};

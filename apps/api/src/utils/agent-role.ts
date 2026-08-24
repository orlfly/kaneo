import {
  type AgentRole,
  DEFAULT_AGENT_ROLE,
  isAgentRole,
} from "@kaneo/permissions";
import type { Context } from "hono";

export type ApiKeyContext = {
  id: string;
  userId: string;
  enabled: boolean;
  permissions: Record<string, string[]> | null;
  metadata: Record<string, unknown> | null;
  agentRole: AgentRole;
};

export function resolveAgentRole(metadata: unknown): AgentRole {
  if (!metadata || typeof metadata !== "object") {
    return DEFAULT_AGENT_ROLE;
  }
  const value = (metadata as Record<string, unknown>).agentRole;
  return isAgentRole(value) ? value : DEFAULT_AGENT_ROLE;
}

export function readAgentRole(c: Context): AgentRole {
  const apiKey = c.get("apiKey") as ApiKeyContext | undefined;
  return apiKey?.agentRole ?? DEFAULT_AGENT_ROLE;
}

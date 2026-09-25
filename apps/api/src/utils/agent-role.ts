import {
  type AgentRole,
  DEFAULT_AGENT_ROLE,
  isAgentRole,
} from "@kaneo/permissions";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export type ApiKeyContext = {
  id: string;
  userId: string;
  enabled: boolean;
  permissions: Record<string, string[]> | null;
  metadata: Record<string, unknown> | null;
  agentRole: AgentRole;
  /** Project the key is bound to, or null when the key spans all projects. */
  projectId: string | null;
};

export function resolveAgentRole(metadata: unknown): AgentRole {
  if (!metadata || typeof metadata !== "object") {
    return DEFAULT_AGENT_ROLE;
  }
  const value = (metadata as Record<string, unknown>).agentRole;
  return isAgentRole(value) ? value : DEFAULT_AGENT_ROLE;
}

export function resolveProjectId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const value = (metadata as Record<string, unknown>).projectId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readAgentRole(c: Context): AgentRole {
  const apiKey = c.get("apiKey") as ApiKeyContext | undefined;
  return apiKey?.agentRole ?? DEFAULT_AGENT_ROLE;
}

export function readProjectId(c: Context): string | null {
  const apiKey = c.get("apiKey") as ApiKeyContext | undefined;
  return apiKey?.projectId ?? null;
}

/**
 * Enforce the API key's project binding. A key without a binding (null) is
 * unrestricted; a bound key may only touch the bound project. Session-based
 * (human) callers have no apiKey context and are never restricted here.
 */
export function assertProjectScope(
  apiKey: ApiKeyContext | undefined,
  projectId: string,
) {
  if (apiKey?.projectId && apiKey.projectId !== projectId) {
    throw new HTTPException(403, {
      message: "This API key is bound to a different project.",
    });
  }
}

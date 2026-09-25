import type { Session, User } from "better-auth/types";
import { vi } from "vitest";
import { auth } from "../../../apps/api/src/auth";

function createSession(userId: string): Session {
  const now = new Date();

  return {
    id: `session-${userId}`,
    token: `token-${userId}`,
    userId,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  };
}

export function mockAuthenticatedSession(user: User) {
  return vi.spyOn(auth.api, "getSession").mockResolvedValue({
    session: createSession(user.id),
    user,
  });
}

/**
 * Mock an authenticated session backed by an API key. The HTTP request must
 * carry an `x-api-key` header whose value is the literal `mock-agent-key`;
 * this stub resolves verifyApiKey with the supplied metadata/agentRole so
 * downstream handlers can branch on the agent identity.
 */
export function mockAgentApiKey(
  user: User,
  options: {
    id?: string;
    enabled?: boolean;
    permissions?: Record<string, string[]> | null;
    metadata?: Record<string, unknown> | null;
    agentRole?: string;
  } = {},
) {
  const apiKeyId = options.id ?? "mock-agent-key";
  return vi.doMock("../../apps/api/src/utils/verify-api-key", () => ({
    verifyApiKey: async () => ({
      valid: true,
      key: {
        id: apiKeyId,
        userId: user.id,
        name: "Mock Agent Key",
        prefix: "mock",
        start: "mock_",
        enabled: options.enabled ?? true,
        expiresAt: null,
        permissions: options.permissions ?? null,
        refillInterval: null,
        refillAmount: null,
        lastRefillAt: null,
        rateLimitEnabled: false,
        rateLimitTimeWindow: 86400000,
        rateLimitMax: 10,
        requestCount: 0,
        remaining: null,
        lastRequest: null,
        metadata: options.metadata ?? null,
      },
    }),
  }));
}

export function mockAnonymousSession() {
  return vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
}

import { createHash } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { resolveProjectId } from "./agent-role";

async function hashApiKey(key: string): Promise<string> {
  const hash = createHash("sha256").update(key).digest();
  return hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function parsePermissions(raw: string | null): Record<string, string[]> | null {
  if (raw === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const permissions: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!Array.isArray(actions)) return {};
    if (actions.some((action) => typeof action !== "string")) return {};
    permissions[resource] = actions as string[];
  }
  return permissions;
}

export async function verifyApiKey(key: string) {
  const hashedKey = await hashApiKey(key);

  const [apiKey] = await db
    .select()
    .from(schema.apikeyTable)
    .where(
      and(
        eq(schema.apikeyTable.key, hashedKey),
        eq(schema.apikeyTable.enabled, true),
        or(
          isNull(schema.apikeyTable.expiresAt),
          gt(schema.apikeyTable.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);

  if (!apiKey) {
    return null;
  }

  const metadata = apiKey.metadata
    ? (JSON.parse(apiKey.metadata) as Record<string, unknown>)
    : null;
  const projectId = resolveProjectId(metadata);

  if (projectId) {
    // A bound key is only usable while its project exists and is not
    // archived; there is no FK on metadata, so this is the deletion guard.
    const [boundProject] = await db
      .select({ id: schema.projectTable.id })
      .from(schema.projectTable)
      .where(
        and(
          eq(schema.projectTable.id, projectId),
          isNull(schema.projectTable.archivedAt),
        ),
      )
      .limit(1);
    if (!boundProject) {
      // 403 with the binding identity, per the agent-key-project-scope spec:
      // the key is unusable until its binding points at an existing project.
      throw new HTTPException(403, {
        message: `API key is bound to project ${projectId}, which no longer exists or is archived.`,
      });
    }
  }

  return {
    valid: true,
    key: {
      id: apiKey.id,
      userId: apiKey.referenceId ?? apiKey.userId ?? "",
      name: apiKey.name,
      prefix: apiKey.prefix,
      start: apiKey.start,
      enabled: apiKey.enabled ?? false,
      expiresAt: apiKey.expiresAt,
      permissions: parsePermissions(apiKey.permissions),
      refillInterval: apiKey.refillInterval,
      refillAmount: apiKey.refillAmount,
      lastRefillAt: apiKey.lastRefillAt,
      rateLimitEnabled: apiKey.rateLimitEnabled,
      rateLimitTimeWindow: apiKey.rateLimitTimeWindow,
      rateLimitMax: apiKey.rateLimitMax,
      requestCount: apiKey.requestCount,
      remaining: apiKey.remaining,
      lastRequest: apiKey.lastRequest,
      metadata,
      projectId,
    },
  };
}

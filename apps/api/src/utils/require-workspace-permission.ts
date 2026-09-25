import { and, eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { isInstanceAdmin } from "./is-instance-admin";

// Back-compat shim for the old workspace permission vocabulary. The team
// model collapses viewer/member/admin/owner into a binary owner/member
// distinction, so team membership satisfies every permission the routes
// still declare. Two deliberate exceptions keep meaningful boundaries:
//
// 1. API key scoping: a key with an explicit permission map is constrained
//    to that map, so integrations can mint narrowly scoped keys even though
//    human members have no per-action permissions.
// 2. workspace:manage_settings maps to the owner role (admins included),
//    matching the old admin/owner-only gating for integration settings and
//    external-author impersonation.
type PermissionMap = Record<string, string[]>;

const MANAGE_SETTINGS: PermissionMap = { workspace: ["manage_settings"] };

function satisfies(
  granted: Record<string, string[]>,
  required: PermissionMap,
): boolean {
  for (const [resource, actions] of Object.entries(required)) {
    const allowed = granted[resource];
    if (!allowed) return false;
    for (const action of actions) {
      if (!allowed.includes(action)) return false;
    }
  }
  return true;
}

// A key without a permissions map is unscoped and keeps full member powers;
// a key with a map is constrained to exactly what it grants.
function apiKeyScopeSatisfied(
  apiKey: { permissions?: Record<string, string[]> | null } | undefined,
  permissions: PermissionMap,
): boolean {
  if (!apiKey?.permissions) return true;
  return satisfies(apiKey.permissions, permissions);
}

function getApiKey(c: Context) {
  return c.get("apiKey") as
    | { permissions?: Record<string, string[]> | null }
    | undefined;
}

export async function hasWorkspacePermission(
  c: Context,
  permissions: PermissionMap,
) {
  const teamId = c.get("teamId");
  if (!teamId) return false;

  if (!apiKeyScopeSatisfied(getApiKey(c), permissions)) {
    return false;
  }

  if (await isInstanceAdmin(c)) {
    return true;
  }

  const userId = c.get("userId");
  if (!userId) return false;

  const [member] = await db
    .select({ role: schema.teamMemberTable.role })
    .from(schema.teamMemberTable)
    .where(
      and(
        eq(schema.teamMemberTable.teamId, teamId),
        eq(schema.teamMemberTable.userId, userId),
      ),
    )
    .limit(1);

  if (!member?.role) return false;

  if (satisfies(MANAGE_SETTINGS, permissions)) {
    // Integration settings and impersonation stay owner-tier in the team
    // model; plain members do not pass.
    return ["owner", "admin"].includes(member.role);
  }

  return true;
}

export function requireWorkspacePermission(permissions: PermissionMap) {
  return async (c: Context, next: Next) => {
    const teamId = c.get("teamId");
    if (!teamId) {
      throw new HTTPException(500, {
        message: "teamId not set in context",
      });
    }

    if (!apiKeyScopeSatisfied(getApiKey(c), permissions)) {
      throw new HTTPException(403, { message: "Insufficient API key scope" });
    }

    if (await isInstanceAdmin(c)) {
      return next();
    }

    const userId = c.get("userId");
    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const [member] = await db
      .select({ role: schema.teamMemberTable.role })
      .from(schema.teamMemberTable)
      .where(
        and(
          eq(schema.teamMemberTable.teamId, teamId),
          eq(schema.teamMemberTable.userId, userId),
        ),
      )
      .limit(1);

    if (!member?.role) {
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }

    if (
      satisfies(MANAGE_SETTINGS, permissions) &&
      !["owner", "admin"].includes(member.role)
    ) {
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }

    return next();
  };
}

import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { and, eq } from "drizzle-orm";
import { isInstanceAdmin } from "./is-instance-admin";

// Back-compat shim for the old workspace permission vocabulary. The team
// model collapses viewer/member/admin/owner into a binary owner/member
// distinction, and any team member can perform the actions that previously
// required a permission row. The `permissions` argument is intentionally
// ignored — its sole purpose is to keep callers compiling while the routes
// are rewritten against `requireTeamRole`.
type PermissionMap = Record<string, string[]>;

export async function hasWorkspacePermission(
  c: Context,
  _permissions: PermissionMap,
) {
  const teamId = c.get("teamId");
  if (!teamId) return false;

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

  return Boolean(member?.role);
}

export function requireWorkspacePermission(_permissions: PermissionMap) {
  return async (c: Context, next: Next) => {
    const teamId = c.get("teamId");
    if (!teamId) {
      throw new HTTPException(500, {
        message: "teamId not set in context",
      });
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

    return next();
  };
}
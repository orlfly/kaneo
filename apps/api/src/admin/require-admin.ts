import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { userTable } from "../database/schema";

/**
 * Instance-admin guard for the user-management API. Only users whose `role` is
 * `admin` (the built-in system administrator or users promoted by one) may
 * manage users.
 */
async function isInstanceAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;
  const [user] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return user?.role === "admin";
}

/**
 * Middleware form for use inside a Hono route chain.
 */
export async function requireAdmin(c: Context, next: Next): Promise<void> {
  const userId = c.get("userId") as string | undefined;
  if (!(await isInstanceAdmin(userId ?? ""))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  await next();
}

/**
 * Guard to call at the start of a handler when the routes are defined on a
 * standalone Hono instance (mirrors the codebase convention of thin route
 * modules without a `.use("*", ...)` chain).
 */
export async function requireAdminHandler(c: Context): Promise<void> {
  const userId = c.get("userId") as string | undefined;
  if (!(await isInstanceAdmin(userId ?? ""))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

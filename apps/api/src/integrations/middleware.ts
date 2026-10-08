import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { projectTable } from "../database/schema";
import { validateTeamAccess } from "../utils/validate-team-access";

// Route middleware runs before the validators, so c.req.valid() is unavailable.
export async function scopeToProjectFromBody(c: Context, next: Next) {
  const userId = c.get("userId");
  if (!userId) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    projectId?: unknown;
  };
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  if (!projectId) {
    throw new HTTPException(400, { message: "projectId is required" });
  }

  const [project] = await db
    .select({ teamId: projectTable.teamId })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  await validateTeamAccess(userId, project.teamId);
  c.set("teamId", project.teamId);

  return next();
}

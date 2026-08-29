import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { publishEvent } from "../../events";
import getProject from "./get-project";

async function deleteProject(id: string, teamId: string) {
  const existingProject = await getProject(id, teamId);

  const [deletedProject] = await db
    .delete(projectTable)
    .where(eq(projectTable.id, id))
    .returning();

  if (!deletedProject) {
    throw new HTTPException(500, {
      message: "Failed to delete project",
    });
  }

  // Notify real-time subscribers that the project was removed so the
  // dashboard cache, activity feed, and notification dispatchers refresh.
  await publishEvent("project.deleted", {
    projectId: id,
    teamId,
    project: existingProject,
  });

  return existingProject;
}

export default deleteProject;

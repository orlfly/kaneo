import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";

async function updateProject(
  id: string,
  name: string,
  icon: string,
  slug: string,
  description: string,
  isPublic: boolean,
  teamId: string,
) {
  const [existingProject] = await db
    .select()
    .from(projectTable)
    .where(and(eq(projectTable.id, id), eq(projectTable.teamId, teamId)));

  if (!existingProject) {
    throw new HTTPException(404, {
      message: "Project doesn't exist or doesn't belong to the specified team",
    });
  }

  const [updatedProject] = await db
    .update(projectTable)
    .set({
      name,
      icon,
      slug,
      description,
      isPublic,
    })
    .where(eq(projectTable.id, id))
    .returning();

  return updatedProject;
}

export default updateProject;

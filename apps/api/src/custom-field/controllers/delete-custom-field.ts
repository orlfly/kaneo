import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  customFieldDefinitionTable,
  projectTable,
} from "../../database/schema";

async function deleteCustomField(id: string) {
  const [field] = await db
    .select({
      projectId: customFieldDefinitionTable.projectId,
      teamId: projectTable.teamId,
    })
    .from(customFieldDefinitionTable)
    .innerJoin(
      projectTable,
      eq(projectTable.id, customFieldDefinitionTable.projectId),
    )
    .where(eq(customFieldDefinitionTable.id, id))
    .limit(1);

  if (!field) {
    throw new HTTPException(404, {
      message: "Custom field or project not found",
    });
  }

  const [deleted] = await db
    .delete(customFieldDefinitionTable)
    .where(eq(customFieldDefinitionTable.id, id))
    .returning();

  if (!deleted) {
    throw new HTTPException(404, {
      message: "Custom field not found",
    });
  }

  return {
    ...deleted,
    teamId: field.teamId,
  };
}

export default deleteCustomField;

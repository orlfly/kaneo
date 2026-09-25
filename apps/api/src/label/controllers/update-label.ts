import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { labelTable } from "../../database/schema";

async function updateLabel(id: string, name: string, color: string) {
  return db.transaction(async (tx) => {
    const label = await tx.query.labelTable.findFirst({
      where: (label, { eq }) => eq(label.id, id),
    });

    if (!label) {
      throw new HTTPException(404, {
        message: "Label not found",
      });
    }

    if (label.deletionStartedAt)
      throw new HTTPException(409, {
        message: "This label is being deleted; resume its deletion instead",
      });

    const [updatedLabel] = await tx
      .update(labelTable)
      .set({ name, color })
      .where(and(eq(labelTable.id, id), isNull(labelTable.deletionStartedAt)))
      .returning();

    // If this is a team-level label, cascade the changes to all
    // task-level copies so existing label assignments reflect the new color/name
    if (!label.taskId && label.teamId) {
      await tx
        .update(labelTable)
        .set({ name, color })
        .where(
          and(
            eq(labelTable.teamId, label.teamId),
            eq(labelTable.name, label.name),
            isNotNull(labelTable.taskId),
          ),
        );
    }

    return updatedLabel;
  });
}

export default updateLabel;

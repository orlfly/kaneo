import db from "../../database";
import { activityTable } from "../../database/schema";

async function createActivity(
  taskId: string,
  type: string,
  userId: string,
  content: string | null,
  eventData?: Record<string, unknown> | null,
  agentKeyId?: string | null,
) {
  const [activity] = await db
    .insert(activityTable)
    .values({
      taskId,
      type,
      userId,
      content,
      eventData: eventData ?? null,
      // Persona attribution: on a deployment where several agent keys share one
      // human `userId`, `userId` alone cannot tell which role acted.
      agentKeyId: agentKeyId ?? null,
    })
    .returning();
  return activity;
}

export default createActivity;

import { eq } from "drizzle-orm";
import db from "../../database";
import { chatMessageTable } from "../../database/schema";

export async function clearMessages(projectId: string): Promise<void> {
  await db
    .delete(chatMessageTable)
    .where(eq(chatMessageTable.projectId, projectId));
}

export default clearMessages;
import { asc, eq } from "drizzle-orm";
import db from "../../database";
import { chatMessageTable } from "../../database/schema";

export type ChatMessageRow = {
  id: string;
  projectId: string;
  role: string;
  content: string;
  createdAt: Date;
};

export async function listMessages(
  projectId: string,
): Promise<ChatMessageRow[]> {
  const rows = await db
    .select({
      id: chatMessageTable.id,
      projectId: chatMessageTable.projectId,
      role: chatMessageTable.role,
      content: chatMessageTable.content,
      createdAt: chatMessageTable.createdAt,
    })
    .from(chatMessageTable)
    .where(eq(chatMessageTable.projectId, projectId))
    .orderBy(asc(chatMessageTable.createdAt));

  return rows;
}

export default listMessages;

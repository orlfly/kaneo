import { desc } from "drizzle-orm";
import db from "../../database";
import { userTable } from "../../database/schema";

export async function listUsers() {
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      displayUsername: userTable.displayUsername,
      email: userTable.email,
      role: userTable.role,
      banned: userTable.banned,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .orderBy(desc(userTable.createdAt));

  return rows;
}

export default listUsers;

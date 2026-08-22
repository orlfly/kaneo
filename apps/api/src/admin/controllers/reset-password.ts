import { eq } from "drizzle-orm";
import db from "../../database";
import { accountTable, userTable } from "../../database/schema";
import { hashPassword } from "../password";

export async function resetUserPassword(userId: string, password: string) {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const [user] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  if (!user) {
    throw new Error("User not found.");
  }

  const hashed = await hashPassword(password);
  const [existing] = await db
    .select({ id: accountTable.id })
    .from(accountTable)
    .where(eq(accountTable.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(accountTable)
      .set({ password: hashed })
      .where(eq(accountTable.id, existing.id));
  } else {
    await db.insert(accountTable).values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: hashed,
    });
  }

  return { id: userId };
}

export default resetUserPassword;

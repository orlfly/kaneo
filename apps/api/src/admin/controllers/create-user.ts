import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import db from "../../database";
import {
  accountTable,
  teamTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import { hashPassword, isValidUsername, normalizeUsername } from "../password";

export type CreateUserInput = {
  username: string;
  name: string;
  email?: string;
  password: string;
  role?: "user" | "admin";
  teamId?: string;
  teamRole?: string;
};

export async function createUser(input: CreateUserInput) {
  const username = normalizeUsername(input.username);
  if (!username) {
    throw new Error("Username is required.");
  }
  if (!isValidUsername(username)) {
    throw new Error(
      "Username may only contain lowercase letters, numbers and underscores (1-30 characters).",
    );
  }
  if (!input.password || input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const email = input.email?.trim() || `${username}@kaneo.local`;

  const existing = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.username, username))
    .limit(1);
  if (existing.length > 0) {
    throw new Error("Username is already taken.");
  }

  const hashed = await hashPassword(input.password);
  const userId = createId();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(userTable).values({
      id: userId,
      name: input.name.trim() || username,
      email,
      emailVerified: true,
      role: input.role || "user",
      username,
      displayUsername: input.username.trim(),
    });
    await tx.insert(accountTable).values({
      id: createId(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: hashed,
    });

    if (input.teamId) {
      const [workspace] = await tx
        .select({ id: teamTable.id })
        .from(teamTable)
        .where(eq(teamTable.id, input.teamId))
        .limit(1);
      if (!workspace) {
        throw new Error("Team not found.");
      }
      await tx.insert(workspaceUserTable).values({
        id: createId(),
        teamId: input.teamId,
        userId,
        role: input.teamRole || "member",
        joinedAt: now,
      });
    }
  });

  return { id: userId, username };
}

export default createUser;

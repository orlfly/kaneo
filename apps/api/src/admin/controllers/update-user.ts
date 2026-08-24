import { and, eq, inArray } from "drizzle-orm";
import db from "../../database";
import { teamMemberTable, userTable } from "../../database/schema";

export type UpdateUserInput = {
  name?: string;
  role?: "user" | "admin";
  banned?: boolean;
  teamId?: string;
  teamRole?: string;
};

export async function updateUser(userId: string, input: UpdateUserInput) {
  const [target] = await db
    .select({ id: userTable.id, role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  if (!target) {
    throw new Error("User not found.");
  }

  const isBuiltInAdmin =
    target.role === "admin" &&
    userId !== "" &&
    (await isLastOrBuiltInAdmin(userId));

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.role !== undefined) {
    if (isBuiltInAdmin && input.role !== "admin") {
      throw new Error("The built-in administrator role cannot be changed.");
    }
    patch.role = input.role;
  }
  if (input.banned !== undefined) {
    if (isBuiltInAdmin && input.banned) {
      throw new Error("The built-in administrator cannot be disabled.");
    }
    patch.banned = input.banned;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(userTable).set(patch).where(eq(userTable.id, userId));
  }

  // (Re)assign workspace membership with a role.
  if (input.teamId) {
    const existing = await db
      .select({ id: teamMemberTable.id })
      .from(teamMemberTable)
      .where(
        and(
          eq(teamMemberTable.teamId, input.teamId),
          eq(teamMemberTable.userId, userId),
        ),
      )
      .limit(1);
    const existingId = existing[0]?.id;
    if (existingId) {
      await db
        .update(teamMemberTable)
        .set({ role: input.teamRole || "member" })
        .where(eq(teamMemberTable.id, existingId));
    } else {
      await db.insert(teamMemberTable).values({
        id: crypto.randomUUID(),
        teamId: input.teamId,
        userId,
        role: input.teamRole || "member",
        joinedAt: new Date(),
      });
    }
  }

  return { id: userId };
}

async function isLastOrBuiltInAdmin(userId: string): Promise<boolean> {
  const admins = await db
    .select({ id: userTable.id, username: userTable.username })
    .from(userTable)
    .where(inArray(userTable.role, ["admin"]));

  const builtIn = admins.find((a) => a.username === "admin");
  const isBuiltInTarget = builtIn?.id === userId;

  if (isBuiltInTarget) return true;
  if (admins.length === 1 && admins[0]?.id === userId) return true;
  return false;
}

export default updateUser;

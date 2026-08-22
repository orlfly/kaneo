import { createId } from "@paralleldrive/cuid2";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import db from "../database";
import { accountTable, userTable } from "../database/schema";

export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "Kingsware@123";

/**
 * Seed a built-in system administrator on startup when no admin exists.
 *
 * Kaneo defaults to an admin-managed, password-only model: users are added by
 * an administrator rather than self-registering. On first boot we create the
 * instance admin with a well-known username/password (overridable through
 * KANEO_ADMIN_USERNAME / KANEO_ADMIN_PASSWORD). The credentials are stored with
 * the same bcrypt hashing used for normal password sign-in, so the account is
 * indistinguishable from any other and the default password should be changed
 * after the first login.
 */
export async function ensureAdminUser(): Promise<void> {
  const username =
    process.env.KANEO_ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
  const password = process.env.KANEO_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.role, "admin"))
    .limit(1);

  if (existing) {
    return;
  }

  const userId = createId();
  const hashed = await bcrypt.hash(password, 10);

  await db.transaction(async (tx) => {
    await tx.insert(userTable).values({
      id: userId,
      name: username,
      email: `${username}@kaneo.local`,
      emailVerified: true,
      role: "admin",
      username: username.toLowerCase(),
      displayUsername: username,
    });
    await tx.insert(accountTable).values({
      id: createId(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: hashed,
    });
  });

  console.log(
    `[admin] Seeded built-in administrator "${username}". Change the default password after first login.`,
  );
}

export default ensureAdminUser;

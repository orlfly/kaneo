import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";

async function createUser(overrides: Partial<{ role: string }> = {}) {
  const userId = `admin-test-user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: "Admin Test User",
      role: overrides.role ?? "user",
    })
    .returning();
  return user;
}

async function createTeam() {
  const teamId = `admin-test-team-${randomUUID()}`;
  const [team] = await db
    .insert(schema.teamTable)
    .values({
      id: teamId,
      name: "Admin Test Team",
      slug: `admin-test-team-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning();
  return team;
}

async function currentMemberships(userId: string) {
  const rows = await db
    .select({ id: schema.teamMemberTable.teamId })
    .from(schema.teamMemberTable)
    .where(eq(schema.teamMemberTable.userId, userId));
  return rows.map((r) => r.id);
}

describe("API integration: admin user team membership", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("allows an instance admin to add and remove a user from a team", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();
    const team = await createTeam();

    mockAuthenticatedSession(admin);
    const { app } = createApp();

    // Initial membership is empty.
    const emptyResponse = await app.request(
      `/api/admin/users/${target.id}/teams`,
    );
    expect(emptyResponse.status).toBe(200);
    expect((await emptyResponse.json()).teams).toEqual([]);

    // Add the target user to the team as a member.
    const addResponse = await app.request(
      `/api/admin/users/${target.id}/teams/${team.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "member" }),
      },
    );
    expect(addResponse.status).toBe(201);
    expect(await currentMemberships(target.id)).toContain(team.id);

    // Listing now includes the team.
    const listResponse = await app.request(
      `/api/admin/users/${target.id}/teams`,
    );
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()).teams;
    expect(listed.map((t: { id: string }) => t.id)).toContain(team.id);

    // Remove the membership again.
    const removeResponse = await app.request(
      `/api/admin/users/${target.id}/teams/${team.id}`,
      { method: "DELETE" },
    );
    expect(removeResponse.status).toBe(200);
    expect(await currentMemberships(target.id)).not.toContain(team.id);
  });

  it("rejects non-admin users with 403", async () => {
    const nonAdmin = await createUser();
    const target = await createUser();

    mockAuthenticatedSession(nonAdmin);
    const { app } = createApp();

    const response = await app.request(`/api/admin/users/${target.id}/teams`);
    expect(response.status).toBe(403);
  });
});

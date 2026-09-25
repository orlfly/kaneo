import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

beforeEach(resetTestDatabase);

async function fixture() {
  const member = await createTeamMember();
  const { project } = await createProjectFixture({
    teamId: member.team.id,
  });
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const put = (body: Record<string, unknown>) =>
    app.request(`/api/project/${project.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: project.name,
        icon: project.icon ?? "Layout",
        slug: project.slug,
        description: project.description ?? "",
        ...body,
      }),
    });
  const stored = async () =>
    (
      await db
        .select({ isPublic: schema.projectTable.isPublic })
        .from(schema.projectTable)
        .where(eq(schema.projectTable.id, project.id))
    )[0]?.isPublic;
  return { put, stored, project, member };
}

describe("project visibility authorization", () => {
  it("allows a team member to publish a private project", async () => {
    const { put, stored } = await fixture();
    const response = await put({ isPublic: true });
    expect(response.status).toBe(200);
    expect(await stored()).toBe(true);
  });

  it("allows unrelated edits without touching visibility", async () => {
    const { put, stored } = await fixture();
    const response = await put({ name: "Renamed", isPublic: false });
    expect(response.status).toBe(200);
    expect(await stored()).toBe(false);
  });

  it("allows unpublishing a public project", async () => {
    const { put, stored, project } = await fixture();
    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, project.id));
    expect((await put({ isPublic: false })).status).toBe(200);
    expect(await stored()).toBe(false);
  });

  it("rejects a non-member regardless of API key permissions", async () => {
    const { project } = await fixture();
    const outsider = await createTeamMember();
    mockAnonymousSession();
    const key = `kaneo_test_${randomUUID()}`;
    await db.insert(schema.apikeyTable).values({
      referenceId: outsider.user.id,
      userId: outsider.user.id,
      key: createHash("sha256").update(key).digest("base64url"),
      name: "outsider key",
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: JSON.stringify({
        project: ["read", "update", "share"],
      }),
      enabled: true,
    });
    const { app } = createApp();
    const response = await app.request(`/api/project/${project.id}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        name: project.name,
        icon: project.icon ?? "Layout",
        slug: project.slug,
        description: project.description ?? "",
        isPublic: true,
      }),
    });
    expect(response.status).toBe(403);
    expect(
      (
        await db
          .select({ isPublic: schema.projectTable.isPublic })
          .from(schema.projectTable)
          .where(eq(schema.projectTable.id, project.id))
      )[0]?.isPublic,
    ).toBe(false);
  });
});

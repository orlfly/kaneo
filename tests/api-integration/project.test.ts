import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

describe("API integration: project creation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects unauthenticated project creation requests", async () => {
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request("/api/project", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamId: "workspace-missing",
        name: "Unauthorized Project",
        icon: "Folder",
        slug: "unauthorized-project",
      }),
    });

    expect(response.status).toBe(401);
    expect(await readErrorBody(response)).toMatchObject({
      message: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  it("creates a project for a workspace member and seeds default columns", async () => {
    const member = await createTeamMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/project", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamId: member.team.id,
        name: "Roadmap",
        icon: "FolderKanban",
        slug: "roadmap",
      }),
    });

    expect(response.status).toBe(200);
    const payload =
      (await response.json()) as typeof schema.projectTable.$inferSelect;

    expect(payload).toMatchObject({
      teamId: member.team.id,
      name: "Roadmap",
      icon: "FolderKanban",
      slug: "roadmap",
    });

    const persistedProject = await db.query.projectTable.findFirst({
      where: eq(schema.projectTable.id, payload.id),
    });

    expect(persistedProject).toMatchObject({
      id: payload.id,
      teamId: member.team.id,
      name: "Roadmap",
      slug: "roadmap",
    });

    const columns = await db.query.columnTable.findMany({
      where: eq(schema.columnTable.projectId, payload.id),
      orderBy: (column, { asc }) => [asc(column.position)],
    });

    expect(columns).toHaveLength(4);
    expect(columns.map((column) => column.slug)).toEqual([
      "to-do",
      "in-progress",
      "in-review",
      "done",
    ]);
    expect(columns.map((column) => column.isFinal)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("rejects project creation for users outside the workspace", async () => {
    const member = await createTeamMember();
    const outsiderId = "user-outsider";

    const [outsider] = await db
      .insert(schema.userTable)
      .values({
        id: outsiderId,
        email: `${outsiderId}@example.com`,
        emailVerified: true,
        name: "Outsider",
      })
      .returning();

    mockAuthenticatedSession(outsider);
    const { app } = createApp();

    const response = await app.request("/api/project", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        teamId: member.team.id,
        name: "Forbidden Project",
        icon: "Folder",
        slug: "forbidden-project",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Not a member of this team");
  });

  it("rejects a project key already used in the team", async () => {
    const member = await createTeamMember();
    const other = await createTeamMember();
    await createProjectFixture({
      teamId: member.team.id,
      name: "Kanban",
      slug: "KAN",
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const create = (teamId: string, slug: string) =>
      app.request("/api/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: "New",
          icon: "Folder",
          slug,
        }),
      });

    const duplicate = await create(member.team.id, "kan");
    expect(duplicate.status).toBe(409);
    const duplicateError = await readErrorBody(duplicate);
    expect(duplicateError.code).toBe("CONFLICT");
    expect(duplicateError.message).toContain('"kan" (Kanban)');
    expect((await create(member.team.id, "ＫＡＮ")).status).toBe(409);

    mockAuthenticatedSession(other.user);
    expect((await create(other.team.id, "KAN")).status).toBe(200);
  });

  it("rejects renaming a project to a key already used in the team", async () => {
    const member = await createTeamMember();
    await createProjectFixture({
      teamId: member.team.id,
      name: "Kanban",
      slug: "KAN",
    });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
      name: "Design",
      slug: "DES",
    });
    const { project: twin } = await createProjectFixture({
      teamId: member.team.id,
      name: "Design Twin",
      slug: "des",
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const update = (id: string, name: string, slug: string) =>
      app.request(`/api/project/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          icon: "Folder",
          slug,
          description: "",
          isPublic: false,
        }),
      });

    expect((await update(twin.id, "Design Twin Renamed", "des")).status).toBe(
      200,
    );
    expect((await update(project.id, "Design", "KAN")).status).toBe(409);
    expect((await update(project.id, "Design", "DSN")).status).toBe(200);
  });

  it("rejects unarchiving a project whose key another project uses", async () => {
    const member = await createTeamMember();
    await createProjectFixture({
      teamId: member.team.id,
      name: "Kanban",
      slug: "KAN",
    });
    const { project: archived } = await createProjectFixture({
      teamId: member.team.id,
      slug: "kan",
    });
    const { project: archivedTwin } = await createProjectFixture({
      teamId: member.team.id,
      slug: "OLD",
    });
    const { project: otherArchived } = await createProjectFixture({
      teamId: member.team.id,
      slug: "old",
    });
    const { project: uniqueArchived } = await createProjectFixture({
      teamId: member.team.id,
      slug: "NEW",
    });
    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(
        inArray(schema.projectTable.id, [
          archived.id,
          archivedTwin.id,
          otherArchived.id,
          uniqueArchived.id,
        ]),
      );
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const unarchive = (id: string) =>
      app.request(`/api/project/${id}/unarchive`, { method: "PUT" });

    const conflict = await unarchive(archived.id);
    expect(conflict.status).toBe(409);
    await expect(conflict.text()).resolves.toContain("(Kanban)");
    expect((await unarchive(archivedTwin.id)).status).toBe(409);
    expect((await unarchive(uniqueArchived.id)).status).toBe(200);
  });
});

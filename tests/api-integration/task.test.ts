import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

describe("API integration: task creation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects unauthenticated task creation requests", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Unauthorized task",
        description: "Should not be created",
        priority: "low",
        status: "to-do",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("creates a task with the matching column, assignee, and next number", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
      name: "Delivery",
      slug: "delivery",
    });

    await db.insert(schema.taskTable).values({
      projectId: project.id,
      userId: member.user.id,
      title: "Existing task",
      description: "Already there",
      status: "to-do",
      columnId: columns.todo.id,
      priority: "medium",
      number: 1,
      position: 1,
    });
    await db
      .update(schema.projectTable)
      .set({ lastTaskNumber: 1 })
      .where(eq(schema.projectTable.id, project.id));

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Ship integration flow",
        description: "Cover the first create-task path",
        priority: "high",
        status: "to-do",
        userId: member.user.id,
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      projectId: string;
      title: string;
      description: string;
      priority: string;
      status: string;
      userId: string | null;
      number: number | null;
      position: number | null;
      assigneeName?: string;
    };

    expect(payload).toMatchObject({
      projectId: project.id,
      title: "Ship integration flow",
      description: "Cover the first create-task path",
      priority: "high",
      status: "to-do",
      userId: member.user.id,
      number: 2,
      position: 2,
      assigneeName: member.user.name,
    });

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      projectId: project.id,
      columnId: columns.todo.id,
      userId: member.user.id,
      title: "Ship integration flow",
      priority: "high",
      status: "to-do",
      number: 2,
      position: 2,
    });
  });

  it("rejects task creation for users outside the project workspace", async () => {
    const member = await createTeamMember();
    const outsiderId = `user-${randomUUID()}`;
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    const [outsider] = await db
      .insert(schema.userTable)
      .values({
        id: outsiderId,
        email: `${outsiderId}@example.com`,
        emailVerified: true,
        name: "Task Outsider",
      })
      .returning();

    mockAuthenticatedSession(outsider);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Forbidden task",
        description: "Should not be created",
        priority: "low",
        status: "to-do",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Not a member of this team");

    const persistedTask = await db.query.taskTable.findFirst({
      where: and(
        eq(schema.taskTable.projectId, project.id),
        eq(schema.taskTable.title, "Forbidden task"),
      ),
    });

    expect(persistedTask).toBeUndefined();
  });

  it("creates an unassigned task with parsed dates when optional fields are provided", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Plan release cut",
        description: "Track optional fields too",
        priority: "medium",
        status: "in-progress",
        startDate: "2026-04-01T09:00:00.000Z",
        dueDate: "2026-04-05T17:00:00.000Z",
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      userId: string | null;
      columnId: string | null;
      startDate: string | null;
      dueDate: string | null;
      assigneeName?: string;
    };

    expect(payload).toMatchObject({
      userId: null,
      columnId: columns.inProgress.id,
      startDate: "2026-04-01T09:00:00.000Z",
      dueDate: "2026-04-05T17:00:00.000Z",
    });
    expect(payload.assigneeName).toBeUndefined();

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      userId: null,
      columnId: columns.inProgress.id,
      status: "in-progress",
    });
    expect(persistedTask?.startDate?.toISOString()).toBe(
      "2026-04-01T09:00:00.000Z",
    );
    expect(persistedTask?.dueDate?.toISOString()).toBe(
      "2026-04-05T17:00:00.000Z",
    );
  });

  it("creates tasks without a column when the status has no matching project column", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Future status task",
        description: "Status does not map to a seeded column",
        priority: "low",
        status: "planned",
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      status: string;
      columnId: string | null;
      position: number | null;
    };

    expect(payload).toMatchObject({
      status: "planned",
      columnId: null,
      position: 1,
    });

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      status: "planned",
      columnId: null,
      position: 1,
    });
  });

  it("rejects task creation when the assignee userId does not exist", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const missingAssigneeId = `user-${randomUUID()}`;

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Ghost assignee task",
        description: "Should fail because the assignee does not exist",
        priority: "low",
        status: "to-do",
        userId: missingAssigneeId,
      }),
    });

    // Fork semantics: a nonexistent assignee is just not a member, so the
    // membership guard answers 403 with the standard not-assignable message.
    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain(
      "Assignee is not a member of this team",
    );

    const persistedTask = await db.query.taskTable.findFirst({
      where: and(
        eq(schema.taskTable.projectId, project.id),
        eq(schema.taskTable.title, "Ghost assignee task"),
      ),
    });

    expect(persistedTask).toBeUndefined();
  });

  it("creates a task when the assignee userId is surrounded by whitespace", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });
    const paddedAssigneeId = `  ${member.user.id}  `;

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Padded assignee task",
        description: "Whitespace around userId should be trimmed",
        priority: "medium",
        status: "to-do",
        userId: paddedAssigneeId,
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      userId: string;
      assigneeName?: string;
    };

    expect(payload.userId).toBe(member.user.id);
    expect(payload.assigneeName).toBe(member.user.name);

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      projectId: project.id,
      columnId: columns.todo.id,
      userId: member.user.id,
      title: "Padded assignee task",
    });
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
  ])(
    "creates an unassigned task when the assignee userId is %s",
    async (label, userId) => {
      const member = await createTeamMember();
      const { project } = await createProjectFixture({
        teamId: member.team.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const title = `Blank assignee task (${label})`;
      const response = await app.request(`/api/task/${project.id}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title,
          description: "Blank userId means unassigned",
          priority: "low",
          status: "to-do",
          userId,
        }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        userId: string | null;
        assigneeName?: string;
      };

      expect(payload.userId).toBeNull();
      expect(payload.assigneeName).toBeUndefined();

      const persistedTask = await db.query.taskTable.findFirst({
        where: and(
          eq(schema.taskTable.projectId, project.id),
          eq(schema.taskTable.title, title),
        ),
      });

      expect(persistedTask?.userId).toBeNull();
    },
  );

  it("creates the declared relations with the task in one request", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    // The prerequisite the new task is created for.
    const [prerequisite] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        title: "Existing prerequisite",
        number: 1,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Dependent follow-up task",
        description: "Depends on the prerequisite",
        priority: "medium",
        status: "to-do",
        relations: [{ targetTaskId: prerequisite.id, relationType: "blocks" }],
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      relations?: Array<{
        id: string;
        sourceTaskId: string;
        targetTaskId: string;
        relationType: string;
      }>;
    };

    expect(payload.relations).toHaveLength(1);
    expect(payload.relations?.[0]).toMatchObject({
      sourceTaskId: payload.id,
      targetTaskId: prerequisite.id,
      relationType: "blocks",
    });

    const persisted = await db.query.taskRelationTable.findFirst({
      where: eq(schema.taskRelationTable.sourceTaskId, payload.id),
    });
    expect(persisted?.targetTaskId).toBe(prerequisite.id);
  });

  it("rejects a relation to a task in another team and creates no task", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    const stranger = await createTeamMember();
    const { project: strangerProject } = await createProjectFixture({
      teamId: stranger.team.id,
    });
    const [strangerTask] = await db
      .insert(schema.taskTable)
      .values({
        projectId: strangerProject.id,
        title: "Foreign task",
        number: 1,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Task that must not survive",
        description: "Its relation target is not reachable",
        priority: "medium",
        status: "to-do",
        relations: [{ targetTaskId: strangerTask.id, relationType: "related" }],
      }),
    });

    // A foreign target reads as "not found" rather than revealing it exists.
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("Target task not found");

    // Relation and task share one transaction, so the task must not be left
    // behind without the relation it was created for.
    const tasks = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(tasks).toHaveLength(0);
    const relations = await db.select().from(schema.taskRelationTable);
    expect(relations).toHaveLength(0);
  });

  it("treats an empty relations array as a task without relations", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Task with an empty relation list",
        description: "Nothing to link",
        priority: "low",
        status: "to-do",
        relations: [],
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      relations?: unknown[];
    };
    expect(payload.relations).toEqual([]);
    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(0);
  });

  it("rejects a relation entry without a target and creates no task", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Task with a nameless relation",
        description: "The entry has no target",
        priority: "low",
        status: "to-do",
        relations: [{ targetTaskId: "  ", relationType: "blocks" }],
      }),
    });

    expect(response.status).toBe(400);
    const tasks = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(tasks).toHaveLength(0);
  });

  it("rejects a repeated relation in one request and creates no task", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    const [target] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        title: "Relation target",
        number: 1,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Task with a duplicated relation",
        description: "Declares the same relation twice",
        priority: "medium",
        status: "to-do",
        relations: [
          { targetTaskId: target.id, relationType: "blocks" },
          { targetTaskId: target.id, relationType: "blocks" },
        ],
      }),
    });

    expect(response.status).toBe(409);
    const tasks = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(tasks).toHaveLength(1); // only the seeded target
  });
});

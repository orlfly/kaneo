import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

const m = vi.hoisted(() => ({ publish: vi.fn(async () => undefined) }));
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<object>()),
  publishEvent: m.publish,
}));
beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});
async function context() {
  const member = await createTeamMember();
  const { project } = await createProjectFixture({
    teamId: member.team.id,
  });
  const [task] = await db
    .insert(schema.taskTable)
    .values({ projectId: project.id, title: "Private title", number: 1 })
    .returning();
  return { ...member, project, task };
}
function get(path: string) {
  return createApp().app.request(`/api/project${path}`);
}
function request(path: string, method: string, body?: unknown) {
  return createApp().app.request(`/api/task-relation${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}
async function seedRelation(sourceTaskId: string, targetTaskId: string) {
  const [relation] = await db
    .insert(schema.taskRelationTable)
    .values({ sourceTaskId, targetTaskId, relationType: "blocks" })
    .returning();
  return relation;
}

describe("task relation tenant boundaries", () => {
  it("rejects a foreign target and a nonexistent target identically", async () => {
    const own = await context();
    const foreign = await context();
    mockAuthenticatedSession(own.user);
    for (const targetTaskId of [foreign.task.id, "missing-task"]) {
      const response = await request("", "POST", {
        sourceTaskId: own.task.id,
        targetTaskId,
        relationType: "blocks",
      });
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Target task not found");
    }
    expect(await db.query.taskRelationTable.findMany()).toHaveLength(0);
    expect(m.publish).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "hides legacy cross-workspace relations from reads in either direction (reverse=%s)",
    async (reverse) => {
      const own = await context();
      const foreign = await context();
      await seedRelation(
        reverse ? foreign.task.id : own.task.id,
        reverse ? own.task.id : foreign.task.id,
      );
      for (const member of [own, foreign]) {
        mockAuthenticatedSession(member.user);
        const response = await request(`/${member.task.id}`, "GET");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([]);
      }
    },
  );

  it("rejects deletion of a legacy foreign-target row without mutation or event", async () => {
    const own = await context();
    const foreign = await context();
    const relation = await seedRelation(own.task.id, foreign.task.id);
    mockAuthenticatedSession(own.user);
    const response = await request(`/${relation.id}`, "DELETE");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Task relation not found");
    expect(
      await db.query.taskRelationTable.findFirst({
        where: eq(schema.taskRelationTable.id, relation.id),
      }),
    ).toBeDefined();
    expect(m.publish).not.toHaveBeenCalled();
  });

  it("requires source-workspace access for deletion even when the target is owned", async () => {
    const own = await context();
    const foreign = await context();
    const relation = await seedRelation(foreign.task.id, own.task.id);
    mockAuthenticatedSession(own.user);
    expect((await request(`/${relation.id}`, "DELETE")).status).toBe(403);
    expect(await db.query.taskRelationTable.findMany()).toHaveLength(1);
    expect(m.publish).not.toHaveBeenCalled();
  });

  it("keeps same-workspace cross-project relations fully usable", async () => {
    const own = await context();
    const { project } = await createProjectFixture({
      teamId: own.team.id,
    });
    const [target] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Related", number: 1 })
      .returning();
    mockAuthenticatedSession(own.user);
    const created = await request("", "POST", {
      sourceTaskId: own.task.id,
      targetTaskId: target.id,
      relationType: "related",
    });
    expect(created.status).toBe(200);
    const relation = (await created.json()) as { id: string };
    for (const task of [own.task, target]) {
      const response = await request(`/${task.id}`, "GET");
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject([
        {
          id: relation.id,
          sourceTask: { id: own.task.id },
          targetTask: { id: target.id },
        },
      ]);
    }
    // The client refreshes both endpoints' panels from this response, so it has
    // to carry them.
    const deleted = await request(`/${relation.id}`, "DELETE");
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({
      id: relation.id,
      sourceTaskId: own.task.id,
      targetTaskId: target.id,
    });
    expect(await db.query.taskRelationTable.findMany()).toHaveLength(0);
    expect(m.publish).toHaveBeenCalledWith(
      "task-relation.deleted",
      expect.objectContaining({
        sourceTaskId: own.task.id,
        targetTaskId: target.id,
      }),
    );
  });

  it("lists a project's relations with both endpoints hydrated", async () => {
    const own = await context();
    const [second] = await db
      .insert(schema.taskTable)
      .values({ projectId: own.project.id, title: "Second", number: 2 })
      .returning();
    await seedRelation(own.task.id, second.id);

    mockAuthenticatedSession(own.user);
    const response = await get(`/${own.project.id}/task-relations`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([
      {
        sourceTaskId: own.task.id,
        targetTaskId: second.id,
        relationType: "blocks",
        sourceTask: { id: own.task.id, title: "Private title" },
        targetTask: { id: second.id, title: "Second" },
      },
    ]);
  });

  it("lists a same-workspace relation that points at another project", async () => {
    const own = await context();
    const { project: sibling } = await createProjectFixture({
      teamId: own.team.id,
    });
    const [siblingTask] = await db
      .insert(schema.taskTable)
      .values({ projectId: sibling.id, title: "Sibling task", number: 1 })
      .returning();
    await seedRelation(own.task.id, siblingTask.id);

    mockAuthenticatedSession(own.user);
    const response = await get(`/${own.project.id}/task-relations`);

    // The Gantt decides whether it can draw a cross-project edge; the API does
    // not hide it as long as both ends are in the workspace.
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([
      { targetTask: { id: siblingTask.id, projectId: sibling.id } },
    ]);
  });

  it("hides a project relation whose other endpoint is in another workspace", async () => {
    const own = await context();
    const foreign = await context();
    await seedRelation(own.task.id, foreign.task.id);

    mockAuthenticatedSession(own.user);
    const response = await get(`/${own.project.id}/task-relations`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("returns an empty list for a project without relations", async () => {
    const own = await context();

    mockAuthenticatedSession(own.user);
    const response = await get(`/${own.project.id}/task-relations`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("refuses the project relation list to a non-member without leaking it", async () => {
    const own = await context();
    const [second] = await db
      .insert(schema.taskTable)
      .values({ projectId: own.project.id, title: "Secret", number: 2 })
      .returning();
    const relation = await seedRelation(own.task.id, second.id);

    const foreign = await context();
    mockAuthenticatedSession(foreign.user);
    const response = await get(`/${own.project.id}/task-relations`);

    // The project is not visible to this caller, so the middleware cannot
    // resolve a team: no 200, and nothing about the relation in the body.
    expect(response.status).not.toBe(200);
    const body = await response.text();
    expect(body).not.toContain(relation.id);
    expect(body).not.toContain(second.id);

    // The member still reads it.
    mockAuthenticatedSession(own.user);
    const memberResponse = await get(`/${own.project.id}/task-relations`);
    expect(memberResponse.status).toBe(200);
    expect(await memberResponse.json()).toMatchObject([{ id: relation.id }]);
  });
});

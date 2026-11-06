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

async function createTask(projectId: string, title: string, number: number) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({ projectId, title, number })
    .returning();
  return task;
}

function createRelation(
  app: ReturnType<typeof createApp>["app"],
  sourceTaskId: string,
  targetTaskId: string,
  relationType: "subtask" | "blocks" | "related",
) {
  return app.request("/api/task-relation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceTaskId, targetTaskId, relationType }),
  });
}

async function expectCycleError(response: Response) {
  expect(response.status).toBe(409);
  expect(await response.text()).toContain("circular dependency");
}

describe("API integration: task relation dependency cycles", () => {
  it("rejects a transitive blocks cycle without writing or publishing", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const a = await createTask(project.id, "A", 1);
    const b = await createTask(project.id, "B", 2);
    const c = await createTask(project.id, "C", 3);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await createRelation(app, a.id, b.id, "blocks")).status).toBe(200);
    expect((await createRelation(app, b.id, c.id, "blocks")).status).toBe(200);

    m.publish.mockClear();
    await expectCycleError(await createRelation(app, c.id, a.id, "blocks"));

    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(2);
    expect(m.publish).not.toHaveBeenCalled();
  });

  it("rejects a transitive subtask cycle", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const a = await createTask(project.id, "A", 1);
    const b = await createTask(project.id, "B", 2);
    const c = await createTask(project.id, "C", 3);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await createRelation(app, a.id, b.id, "subtask")).status).toBe(200);
    expect((await createRelation(app, b.id, c.id, "subtask")).status).toBe(200);

    await expectCycleError(await createRelation(app, c.id, a.id, "subtask"));

    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(2);
  });

  it("rejects a cycle that mixes blocks and subtask relations", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const a = await createTask(project.id, "A", 1);
    const b = await createTask(project.id, "B", 2);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    // B waits for A.
    expect((await createRelation(app, a.id, b.id, "blocks")).status).toBe(200);

    // Adding "A is a parent of B" makes A wait for B: a cycle.
    await expectCycleError(await createRelation(app, a.id, b.id, "subtask"));

    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(1);
  });

  it("keeps a transitive dependency that does not close a cycle", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const a = await createTask(project.id, "A", 1);
    const b = await createTask(project.id, "B", 2);
    const c = await createTask(project.id, "C", 3);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await createRelation(app, a.id, b.id, "blocks")).status).toBe(200);
    expect((await createRelation(app, b.id, c.id, "blocks")).status).toBe(200);

    // C already waits on A transitively; declaring it again adds no cycle.
    expect((await createRelation(app, a.id, c.id, "blocks")).status).toBe(200);

    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(3);
  });

  it("allows related relations regardless of dependency direction", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const a = await createTask(project.id, "A", 1);
    const b = await createTask(project.id, "B", 2);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await createRelation(app, a.id, b.id, "blocks")).status).toBe(200);
    expect((await createRelation(app, b.id, a.id, "related")).status).toBe(200);

    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(2);
  });

  it("detects cycles across projects in the same workspace", async () => {
    const member = await createTeamMember();
    const { project: first } = await createProjectFixture({
      teamId: member.team.id,
    });
    const { project: second } = await createProjectFixture({
      teamId: member.team.id,
    });
    const a = await createTask(first.id, "A", 1);
    const b = await createTask(second.id, "B", 1);
    const c = await createTask(first.id, "C", 2);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await createRelation(app, a.id, b.id, "blocks")).status).toBe(200);
    expect((await createRelation(app, b.id, c.id, "blocks")).status).toBe(200);

    await expectCycleError(await createRelation(app, c.id, a.id, "blocks"));

    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(2);
  });

  it("serializes concurrent relation writes so only one closes the cycle", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const a = await createTask(project.id, "A", 1);
    const b = await createTask(project.id, "B", 2);
    const c = await createTask(project.id, "C", 3);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await createRelation(app, a.id, b.id, "blocks")).status).toBe(200);

    // Individually each edge is valid. Together they close A -> C -> B -> A.
    const [first, second] = await Promise.all([
      createRelation(app, b.id, c.id, "blocks"),
      createRelation(app, c.id, a.id, "blocks"),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(2);
  });
});

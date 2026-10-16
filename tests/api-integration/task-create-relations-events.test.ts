import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

// The websocket layer turns task-relation.created into a TASK_RELATION_UPDATED
// broadcast, which is what invalidates the Gantt's relations query. Assert the
// event rather than only the rows.
const m = vi.hoisted(() => ({ publish: vi.fn(async () => undefined) }));
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<object>()),
  publishEvent: m.publish,
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});

describe("API integration: task creation relation events", () => {
  it("publishes a relation event per created relation, after the task event", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const [prerequisite] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Prerequisite", number: 1 })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Dependent task with two relations",
        description: "Blocks the prerequisite and relates to it",
        priority: "medium",
        status: "to-do",
        relations: [
          { targetTaskId: prerequisite.id, relationType: "blocks" },
          { targetTaskId: prerequisite.id, relationType: "related" },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string };
    expect(payload.id).toBeTruthy();

    const events = m.publish.mock.calls.map(([name]) => name);
    expect(events).toContain("task.created");
    expect(
      events.filter((name) => name === "task-relation.created"),
    ).toHaveLength(2);

    const relationEvents = m.publish.mock.calls.filter(
      ([name]) => name === "task-relation.created",
    );
    for (const [, payloadArg] of relationEvents) {
      const data = payloadArg as {
        taskId: string;
        projectId: string;
        userId: string;
        relationType: string;
      };
      // The broadcast keys off taskId, so it must be the source (the new task).
      expect(data.taskId).toBe(payload.id);
      expect(data.projectId).toBe(project.id);
      expect(data.userId).toBe(member.user.id);
    }
    expect(
      relationEvents.map(([, payloadArg]) => payloadArg.relationType).sort(),
    ).toEqual(["blocks", "related"]);
  });

  it("publishes no relation event when the task declares none", async () => {
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
        title: "Plain task",
        description: "No relations",
        priority: "low",
        status: "to-do",
      }),
    });

    expect(response.status).toBe(200);
    const events = m.publish.mock.calls.map(([name]) => name);
    expect(events).toEqual(["task.created"]);
    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(0);
    const tasks = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(tasks).toHaveLength(1);
  });
});

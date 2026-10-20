import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

/**
 * Task-processing agents must respect `blocks` relations: a task whose blocker
 * is still open cannot be started, so the scheduler must never hand it out.
 * Once the blocker reaches a final column the dependent becomes claimable.
 */

type ApiKeyStub = {
  userId: string;
  metadata: Record<string, unknown> | null;
};
let currentApiKey: ApiKeyStub | null = null;

vi.mock("../../apps/api/src/utils/verify-api-key", async () => {
  const actual = await vi.importActual<
    typeof import("../../apps/api/src/utils/verify-api-key")
  >("../../apps/api/src/utils/verify-api-key");
  return {
    ...actual,
    verifyApiKey: async (rawKey: string) => {
      if (!currentApiKey) return null;
      if (rawKey !== "mock-agent-key") return null;
      return {
        valid: true,
        key: {
          id: `mock-agent-key-${currentApiKey.userId}`,
          userId: currentApiKey.userId,
          name: "Mock Agent Key",
          prefix: "mock",
          start: "mock_",
          enabled: true,
          expiresAt: null,
          permissions: null,
          refillInterval: null,
          refillAmount: null,
          lastRefillAt: null,
          rateLimitEnabled: false,
          rateLimitTimeWindow: 86400000,
          rateLimitMax: 10,
          requestCount: 0,
          remaining: null,
          lastRequest: null,
          metadata: currentApiKey.metadata,
        },
      };
    },
  };
});

async function agentFetch(
  app: Awaited<ReturnType<typeof createApp>>["app"],
  path: string,
  init: { method?: string; json?: unknown } = {},
) {
  const headers: Record<string, string> = { "x-api-key": "mock-agent-key" };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  return app.request(path, {
    method: init.method,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
}

const counters = new Map<string, number>();
function nextNumber(projectId: string) {
  const current = (counters.get(projectId) ?? 0) + 1;
  counters.set(projectId, current);
  return current;
}

async function seedTask(
  projectId: string,
  status: string,
  title: string,
  requiredRole: string | null = "coding",
) {
  const number = nextNumber(projectId);
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title,
      description: "",
      status,
      priority: "medium",
      position: number,
      number,
      requiredRole,
    })
    .returning();
  return task;
}

async function block(
  sourceTaskId: string,
  targetTaskId: string,
  relationType = "blocks",
) {
  await db.insert(schema.taskRelationTable).values({
    sourceTaskId,
    targetTaskId,
    relationType,
  });
}

describe("API integration: dependencies gate task dispatch", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    counters.clear();
    currentApiKey = null;
  });

  it("does not hand out a task whose blocker is still open", async () => {
    const member = await createTeamMember({ role: "member" });
    const other = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    // The blocker is already held by another agent, so the dependent is the
    // only free candidate: without the filter it would be claimed outright.
    const prerequisite = await seedTask(
      project.id,
      "in-progress",
      "Prerequisite",
    );
    await db
      .update(schema.taskTable)
      .set({
        userId: other.user.id,
        claimedBy: "another-agent-key",
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, prerequisite.id));
    const dependent = await seedTask(project.id, "to-do", "Dependent");
    await block(prerequisite.id, dependent.id);

    currentApiKey = {
      userId: member.user.id,
      metadata: { agentRole: "coding" },
    };
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });

    // Nothing left to claim: the only free task is blocked.
    expect(response.status).toBe(404);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, dependent.id),
    });
    expect(persisted?.userId).toBeNull();
  });

  it("keeps handing out unrelated tasks while one is blocked", async () => {
    const member = await createTeamMember({ role: "member" });
    const other = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const prerequisite = await seedTask(
      project.id,
      "in-progress",
      "Prerequisite",
    );
    await db
      .update(schema.taskTable)
      .set({
        userId: other.user.id,
        claimedBy: "another-agent-key",
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, prerequisite.id));
    const dependent = await seedTask(project.id, "to-do", "Dependent");
    const unrelated = await seedTask(project.id, "to-do", "Unrelated");
    await block(prerequisite.id, dependent.id);
    await db
      .update(schema.taskTable)
      .set({ createdAt: new Date(Date.now() + 60_000) })
      .where(eq(schema.taskTable.id, unrelated.id));

    currentApiKey = {
      userId: member.user.id,
      metadata: { agentRole: "coding" },
    };
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { taskId: string }).taskId).toBe(
      unrelated.id,
    );
  });

  it("hands the dependent out once the blocker reaches a final column", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const prerequisite = await seedTask(project.id, "to-do", "Prerequisite");
    const dependent = await seedTask(project.id, "to-do", "Dependent");
    await block(prerequisite.id, dependent.id);
    await db
      .update(schema.taskTable)
      .set({ status: "done" })
      .where(eq(schema.taskTable.id, prerequisite.id));

    currentApiKey = {
      userId: member.user.id,
      metadata: { agentRole: "coding" },
    };
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { taskId: string }).taskId).toBe(
      dependent.id,
    );
  });

  it("keeps a task claimable when its blocker was archived", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const prerequisite = await seedTask(project.id, "to-do", "Prerequisite");
    const dependent = await seedTask(project.id, "to-do", "Dependent");
    await block(prerequisite.id, dependent.id);
    // Archived means abandoned: it must not strand the task behind it.
    await db
      .update(schema.taskTable)
      .set({ status: "archived" })
      .where(eq(schema.taskTable.id, prerequisite.id));

    currentApiKey = {
      userId: member.user.id,
      metadata: { agentRole: "coding" },
    };
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { taskId: string }).taskId).toBe(
      dependent.id,
    );
  });

  it("ignores subtask and related relations when dispatching", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const parent = await seedTask(project.id, "in-progress", "Parent");
    const child = await seedTask(project.id, "to-do", "Child");
    await block(parent.id, child.id, "subtask");
    await block(parent.id, child.id, "related");

    currentApiKey = {
      userId: member.user.id,
      metadata: { agentRole: "coding" },
    };
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });

    // Only `blocks` gates a start; a subtask link or a "related" link does not.
    expect(response.status).toBe(200);
    expect(((await response.json()) as { taskId: string }).taskId).toBe(
      child.id,
    );
  });

  it("refuses an explicit claim of a blocked task and names the blocker", async () => {
    const member = await createTeamMember({ role: "member" });
    const other = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const prerequisite = await seedTask(
      project.id,
      "in-progress",
      "Prerequisite",
    );
    await db
      .update(schema.taskTable)
      .set({
        userId: other.user.id,
        claimedBy: "another-agent-key",
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, prerequisite.id));
    const dependent = await seedTask(project.id, "to-do", "Dependent");
    await block(prerequisite.id, dependent.id);

    currentApiKey = {
      userId: member.user.id,
      metadata: { agentRole: "coding" },
    };
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${dependent.id}`, {
      method: "POST",
    });

    expect(response.status).toBe(409);
    // The conflict body is the raw HTTPException message.
    expect(await response.text()).toContain("blocked by");
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, dependent.id),
    });
    expect(persisted?.userId).toBeNull();
  });
});

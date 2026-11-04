import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resumeDependencyReadyTasks } from "../../apps/api/src/scheduler/resume-dependency-ready-tasks";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

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
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
    json?: unknown;
  } = {},
) {
  const headers: Record<string, string> = {
    "x-api-key": "mock-agent-key",
    ...(init.headers ?? {}),
  };
  const body =
    init.json !== undefined
      ? JSON.stringify(init.json)
      : (init.body ?? undefined);
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
  }
  return app.request(path, { method: init.method, headers, body });
}

function setAgent(userId: string, role: string) {
  currentApiKey = { userId, metadata: { agentRole: role } };
}

const projectCounters = new Map<string, number>();
function nextNumber(projectId: string) {
  const current = projectCounters.get(projectId) ?? 0;
  projectCounters.set(projectId, current + 1);
  return current + 1;
}

async function seedTask(
  projectId: string,
  status: string,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title: "Task",
      description: "",
      status,
      priority: "medium",
      position: nextNumber(projectId),
      number: nextNumber(projectId),
      ...overrides,
    })
    .returning();
  return task;
}

describe("API integration: review claim idempotency", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
    projectCounters.clear();
  });

  it("re-claiming a review already held by the same key is a resume, not a new event", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const task = await seedTask(project.id, "in-review", {
      requiredRole: "coding",
      userId: member.user.id,
    });
    setAgent(member.user.id, "code-review");
    const { app } = createApp();

    const first = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { resumed: boolean }).resumed).toBe(false);

    const second = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { resumed: boolean }).resumed).toBe(true);

    const [count] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, task.id),
          eq(schema.activityTable.type, "review-claimed"),
        ),
      );
    expect(Number(count?.count ?? 0)).toBe(1);
  });
});

describe("API integration: pause and resume guards", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
    projectCounters.clear();
  });

  it("requires a reason when the generic status endpoint pauses a task", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const task = await seedTask(project.id, "in-progress", {
      userId: member.user.id,
    });
    setAgent(member.user.id, "coding");
    const { app } = createApp();

    const missing = await agentFetch(app, `/api/task/status/${task.id}`, {
      method: "PUT",
      json: { status: "paused" },
    });
    expect(missing.status).toBe(400);

    const paused = await agentFetch(app, `/api/task/status/${task.id}`, {
      method: "PUT",
      json: { status: "paused", pausedReason: "waiting for #999" },
    });
    expect(paused.status).toBe(200);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.status).toBe("paused");
    expect(persisted?.pausedReason).toBe("waiting for #999");

    const resumed = await agentFetch(app, `/api/task/status/${task.id}`, {
      method: "PUT",
      json: { status: "in-progress" },
    });
    expect(resumed.status).toBe(200);
    const afterResume = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(afterResume?.pausedReason).toBeNull();
  });

  it("pause clears the review lock and records the reason on the timeline", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const task = await seedTask(project.id, "in-review", {
      userId: member.user.id,
      reviewClaimedBy: "another-reviewer-key",
      reviewClaimedAt: new Date(),
    });
    setAgent(member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/pause/${task.id}`, {
      method: "POST",
      json: { reason: "waiting for credentials" },
    });
    expect(response.status).toBe(200);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.status).toBe("paused");
    expect(persisted?.pausedReason).toBe("waiting for credentials");
    expect(persisted?.reviewClaimedBy).toBeNull();

    const detail = await agentFetch(app, `/api/task/${task.id}`);
    expect(detail.status).toBe(200);
    expect(
      ((await detail.json()) as { pausedReason: string | null }).pausedReason,
    ).toBe("waiting for credentials");

    const entry = await vi.waitFor(
      async () => {
        const row = await db.query.activityTable.findFirst({
          where: and(
            eq(schema.activityTable.taskId, task.id),
            eq(schema.activityTable.type, "status_changed"),
          ),
        });
        expect(row?.eventData).toMatchObject({
          newStatus: "paused",
          reason: "waiting for credentials",
        });
        return row;
      },
      { timeout: 5000 },
    );
    expect(entry?.userId).toBe(member.user.id);
  });

  it("an agent cannot resume a task whose blocking prerequisite is still open", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({ teamId: member.team.id });
    const blocker = await seedTask(project.id, "to-do");
    const task = await seedTask(project.id, "paused", {
      userId: member.user.id,
      pausedReason: "waiting for prerequisite",
    });
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: blocker.id,
      targetTaskId: task.id,
      relationType: "blocks",
    });
    setAgent(member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/resume/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(409);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.status).toBe("paused");
  });
});

describe("scheduler: dependency-ready paused tasks", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    projectCounters.clear();
  });

  it("resumes a reasoned pause when all declared dependencies are final", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });

    const child = await seedTask(project.id, "done", {
      columnId: columns.done.id,
    });
    const parent = await seedTask(project.id, "paused", {
      pausedReason: "waiting for child #1",
      userId: member.user.id,
      claimedBy: "old-agent-key",
      claimedAt: new Date(),
    });
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: parent.id,
      targetTaskId: child.id,
      relationType: "subtask",
    });

    const unfinished = await seedTask(project.id, "to-do");
    const blocked = await seedTask(project.id, "paused", {
      pausedReason: "waiting for prerequisite",
    });
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: unfinished.id,
      targetTaskId: blocked.id,
      relationType: "blocks",
    });

    const childForUnreasoned = await seedTask(project.id, "done", {
      columnId: columns.done.id,
    });
    const unreasoned = await seedTask(project.id, "paused");
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: unreasoned.id,
      targetTaskId: childForUnreasoned.id,
      relationType: "subtask",
    });

    const result = await resumeDependencyReadyTasks();
    expect(result.resumed).toBe(1);

    const resumedParent = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, parent.id),
    });
    expect(resumedParent?.status).toBe("to-do");
    expect(resumedParent?.pausedReason).toBeNull();
    expect(resumedParent?.userId).toBeNull();
    expect(resumedParent?.claimedBy).toBeNull();

    const stillBlocked = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, blocked.id),
    });
    expect(stillBlocked?.status).toBe("paused");

    const stillPaused = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, unreasoned.id),
    });
    expect(stillPaused?.status).toBe("paused");

    const entry = await vi.waitFor(
      async () => {
        const row = await db.query.activityTable.findFirst({
          where: and(
            eq(schema.activityTable.taskId, parent.id),
            eq(schema.activityTable.type, "status_changed"),
          ),
        });
        expect(row?.eventData).toMatchObject({
          oldStatus: "paused",
          newStatus: "to-do",
        });
        return row;
      },
      { timeout: 5000 },
    );
    expect(entry?.userId).toBeNull();
  });
});

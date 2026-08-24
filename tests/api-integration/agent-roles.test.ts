import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

// Module-level mutable state for the verify-api-key stub. Each test sets the
// agent role metadata before issuing requests.
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
          id: "mock-agent-key",
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
  return app.request(path, {
    method: init.method,
    headers,
    body,
  });
}

function setAgent(userId: string, role: string) {
  currentApiKey = { userId, metadata: { agentRole: role } };
}

async function seedTaskWithRole(
  projectId: string,
  requiredRole: string | null,
  title = "Role task",
  number = nextNumber(projectId),
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title,
      description: "",
      status: "to-do",
      priority: "medium",
      position: number,
      number,
      requiredRole,
    })
    .returning();
  return task;
}

const projectCounters = new Map<string, number>();
function nextNumber(projectId: string) {
  const current = projectCounters.get(projectId) ?? 0;
  projectCounters.set(projectId, current + 1);
  return current + 1;
}

describe("API integration: agent role-based claim", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
  });

  it("claims an unassigned task whose required role matches the agent", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTaskWithRole(project.id, "testing");
    setAgent(member.user.id, "testing");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.userId).toBe(member.user.id);
  });

  it("rejects a claim when the agent role does not match the required role", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTaskWithRole(project.id, "devops");
    setAgent(member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(403);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.userId).toBeNull();
  });

  it("claims a generic task (no required role) for any agent", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTaskWithRole(project.id, null, "Generic task");
    setAgent(member.user.id, "ui-design");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
  });

  it("claim-next prefers assigned-to-me over role-matched unassigned", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const assigned = await seedTaskWithRole(
      project.id,
      "product-design",
      "Assigned to me",
    );
    await db
      .update(schema.taskTable)
      .set({ userId: member.user.id })
      .where(eq(schema.taskTable.id, assigned.id));
    const roleMatch = await seedTaskWithRole(
      project.id,
      "product-design",
      "Role matched",
    );
    setAgent(member.user.id, "product-design");
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { taskId: string };
    expect(payload.taskId).toBe(assigned.id);
    // unused but keep both seeded tasks alive
    void roleMatch;
  });

  it("claim-next picks role-matched unassigned task when none assigned", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    await seedTaskWithRole(project.id, "coding", "Other role task");
    const mine = await seedTaskWithRole(
      project.id,
      "testing",
      "My testing task",
    );
    setAgent(member.user.id, "testing");
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { taskId: string };
    expect(payload.taskId).toBe(mine.id);
  });

  it("claim-next returns 404 when no matching candidate exists", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    await seedTaskWithRole(project.id, "devops", "Only devops task");
    setAgent(member.user.id, "ui-design");
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(404);
  });

  it("rejects invalid requiredRole on create-task", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    setAgent(member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/${project.id}`, {
      method: "POST",
      json: {
        title: "Bad role",
        description: "",
        priority: "medium",
        status: "to-do",
        requiredRole: "not-a-real-role",
      },
    });
    expect(response.status).toBe(400);
  });

  it("stores a valid requiredRole on create-task", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    setAgent(member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/${project.id}`, {
      method: "POST",
      json: {
        title: "UI redesign",
        description: "",
        priority: "medium",
        status: "to-do",
        requiredRole: "ui-design",
      },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      requiredRole: string | null;
    };
    expect(payload.requiredRole).toBe("ui-design");
  });
});

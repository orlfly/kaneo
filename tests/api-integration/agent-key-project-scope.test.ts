import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
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
          projectId:
            (currentApiKey.metadata?.projectId as string | undefined) ?? null,
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
    json?: unknown;
  } = {},
) {
  const headers: Record<string, string> = {
    "x-api-key": "mock-agent-key",
  };
  let body: string | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  return app.request(path, {
    method: init.method,
    headers,
    body,
  });
}

function setAgent(userId: string, metadata: Record<string, unknown>) {
  currentApiKey = { userId, metadata };
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
  requiredRole: string | null,
  title = "Task",
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title,
      description: "",
      status,
      priority: "medium",
      position: nextNumber(projectId),
      number: nextNumber(projectId),
      requiredRole,
    })
    .returning();
  return task;
}

describe("API integration: agent key project scope", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
    projectCounters.clear();
  });

  it("claim-next with a project-bound key only picks tasks from the bound project", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project: boundProject } = await createProjectFixture({
      teamId: member.team.id,
      name: "Bound Project",
    });
    const { project: otherProject } = await createProjectFixture({
      teamId: member.team.id,
      name: "Other Project",
    });
    // The other project has an older, higher-priority task that would win
    // without the binding.
    await seedTask(otherProject.id, "to-do", null, "Other project task");
    const boundTask = await seedTask(
      boundProject.id,
      "to-do",
      null,
      "Bound project task",
    );
    setAgent(member.user.id, {
      agentRole: "coding",
      projectId: boundProject.id,
    });
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { taskId: string };
    expect(payload.taskId).toBe(boundTask.id);
  });

  it("claim-next with an unbound key keeps the cross-project behavior", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project: p1 } = await createProjectFixture({
      teamId: member.team.id,
      name: "P1",
    });
    const { project: p2 } = await createProjectFixture({
      teamId: member.team.id,
      name: "P2",
    });
    await seedTask(p1.id, "to-do", null, "P1 task");
    await seedTask(p2.id, "to-do", null, "P2 task");
    setAgent(member.user.id, { agentRole: "coding" });
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
  });

  it("claim-next with a bound key rejects an explicit different projectId", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project: boundProject } = await createProjectFixture({
      teamId: member.team.id,
      name: "Bound",
    });
    const { project: other } = await createProjectFixture({
      teamId: member.team.id,
      name: "Other",
    });
    setAgent(member.user.id, {
      agentRole: "coding",
      projectId: boundProject.id,
    });
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: { projectId: other.id },
    });
    expect(response.status).toBe(403);
  });

  it("bound key gets 403 reading a task in another project", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project: boundProject } = await createProjectFixture({
      teamId: member.team.id,
      name: "Bound",
    });
    const { project: other } = await createProjectFixture({
      teamId: member.team.id,
      name: "Other",
    });
    const otherTask = await seedTask(other.id, "to-do", null, "Other task");
    setAgent(member.user.id, {
      agentRole: "coding",
      projectId: boundProject.id,
    });
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/${otherTask.id}`, {
      method: "GET",
    });
    expect(response.status).toBe(403);
  });

  it("bound key gets 403 claiming a task in another project", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project: boundProject } = await createProjectFixture({
      teamId: member.team.id,
      name: "Bound",
    });
    const { project: other } = await createProjectFixture({
      teamId: member.team.id,
      name: "Other",
    });
    const otherTask = await seedTask(other.id, "to-do", "coding", "Other task");
    setAgent(member.user.id, {
      agentRole: "coding",
      projectId: boundProject.id,
    });
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${otherTask.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(403);
  });

  it("bound key gets 403 creating a task in another project", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project: boundProject } = await createProjectFixture({
      teamId: member.team.id,
      name: "Bound",
    });
    const { project: other } = await createProjectFixture({
      teamId: member.team.id,
      name: "Other",
    });
    setAgent(member.user.id, {
      agentRole: "coding",
      projectId: boundProject.id,
    });
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/${other.id}`, {
      method: "POST",
      json: {
        title: "Cross project creation",
        description: "Acceptance Criteria\n- creates in other project",
        priority: "medium",
        status: "to-do",
      },
    });
    expect(response.status).toBe(403);
  });

  it("bound key can still read and claim inside the bound project", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project: boundProject } = await createProjectFixture({
      teamId: member.team.id,
      name: "Bound",
    });
    const task = await seedTask(
      boundProject.id,
      "to-do",
      "coding",
      "Bound task",
    );
    setAgent(member.user.id, {
      agentRole: "coding",
      projectId: boundProject.id,
    });
    const { app } = createApp();

    const listResponse = await agentFetch(
      app,
      `/api/task/tasks/${boundProject.id}`,
      { method: "GET" },
    );
    expect(listResponse.status).toBe(200);

    const claimResponse = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(claimResponse.status).toBe(200);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.userId).toBe(member.user.id);
    expect(persisted?.status).toBe("in-progress");
  });

  it("bound key gets 403 updating a task in another project", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project: boundProject } = await createProjectFixture({
      teamId: member.team.id,
      name: "Bound",
    });
    const { project: other } = await createProjectFixture({
      teamId: member.team.id,
      name: "Other",
    });
    const otherTask = await seedTask(other.id, "to-do", null, "Other task");
    setAgent(member.user.id, {
      agentRole: "coding",
      projectId: boundProject.id,
    });
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/title/${otherTask.id}`, {
      method: "PUT",
      json: { title: "Renamed by bound key" },
    });
    expect(response.status).toBe(403);
  });

  it("bound key gets 403 with binding message when the bound project is deleted", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project: boundProject } = await createProjectFixture({
      teamId: member.team.id,
      name: "Vanished",
    });

    // Exercise the real verifyApiKey (the mock only covers the scoped-key
    // shortcut for request flows): seed a real key row bound to the project,
    // delete the project, and observe the guard.
    const rawKey = "vanished-raw-key";
    const hash = createHash("sha256").update(rawKey).digest();
    const hashedKey = hash
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    await db.insert(schema.apikeyTable).values({
      name: "vanished-binding",
      key: hashedKey,
      prefix: "van_",
      start: "van_",
      referenceId: member.user.id,
      userId: member.user.id,
      metadata: JSON.stringify({
        agentRole: "coding",
        projectId: boundProject.id,
      }),
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db
      .delete(schema.projectTable)
      .where(eq(schema.projectTable.id, boundProject.id));

    // Bypass the module-level verifyApiKey mock so the real implementation
    // (hash lookup, metadata parse, project existence guard) runs.
    const actual = (await vi.importActual(
      "../../apps/api/src/utils/verify-api-key",
    )) as typeof import("../../apps/api/src/utils/verify-api-key");
    await expect(actual.verifyApiKey(rawKey)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining(boundProject.id),
    });
  });
});

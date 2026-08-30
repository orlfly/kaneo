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

describe("API integration: role-specific claim rules", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
  });

  it("coding agent claims a to-do task with matching requiredRole", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "to-do", "coding");
    setAgent(member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.userId).toBe(member.user.id);
    // claiming moves to in-progress and sets requiredRole to agent role
    expect(persisted?.status).toBe("in-progress");
    expect(persisted?.requiredRole).toBe("coding");
  });

  it("coding agent refuses a role-mismatched to-do task", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "to-do", "testing");
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

  it("code-review agent review-claims an in-review task without touching implementer fields", async () => {
    const implementer = await createTeamMember({ role: "member" });
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "in-review", "coding");
    // The in-review task has an implementer assigned (submitted work).
    await db
      .update(schema.taskTable)
      .set({
        userId: implementer.user.id,
        claimedBy: "implementer-key",
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, task.id));
    setAgent(member.user.id, "code-review");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: string };
    expect(payload.status).toBe("in-review");
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    // Review lock taken, but implementer attribution and status untouched.
    expect(persisted?.reviewClaimedBy).toBe(`mock-agent-key-${member.user.id}`);
    expect(persisted?.userId).toBe(implementer.user.id);
    expect(persisted?.claimedBy).toBe("implementer-key");
    expect(persisted?.status).toBe("in-review");
  });

  it("a second code-review agent cannot review-claim a task already under review", async () => {
    const reviewerA = await createTeamMember({ role: "member" });
    const reviewerB = await createTeamMember({ role: "member" });
    // Reviewer B must belong to the same team as the project to reach the task.
    await db.insert(schema.teamMemberTable).values({
      teamId: reviewerA.team.id,
      userId: reviewerB.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    const { project } = await createProjectFixture({
      teamId: reviewerA.team.id,
    });
    const task = await seedTask(project.id, "in-review", "coding");
    await db
      .update(schema.taskTable)
      .set({ userId: reviewerB.user.id })
      .where(eq(schema.taskTable.id, task.id));

    // Reviewer A claims the review.
    setAgent(reviewerA.user.id, "code-review");
    const { app } = createApp();
    const a = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(a.status).toBe(200);

    // Reviewer B is excluded while A holds the lock.
    setAgent(reviewerB.user.id, "code-review");
    const b = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(b.status).toBe(409);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.reviewClaimedBy).toBe(
      `mock-agent-key-${reviewerA.user.id}`,
    );
    expect(persisted?.userId).toBe(reviewerB.user.id);
    expect(persisted?.status).toBe("in-review");
  });

  it("code-review agent does not claim a to-do task", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "to-do", null);
    setAgent(member.user.id, "code-review");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(409);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.userId).toBeNull();
  });

  it("claim-next for code-review picks an in-review task", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    await seedTask(project.id, "to-do", null, "Ignored to-do task");
    const inReview = await seedTask(
      project.id,
      "in-review",
      "testing",
      "In review task",
    );
    setAgent(member.user.id, "code-review");
    const { app } = createApp();

    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { taskId: string };
    expect(payload.taskId).toBe(inReview.id);
  });
});

describe("API integration: requiredRole flow on status change", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
  });

  it("agent moving task to in-progress sets requiredRole to agent role", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "to-do", null);
    setAgent(member.user.id, "devops");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/status/${task.id}`, {
      method: "PUT",
      json: { status: "in-progress" },
    });
    expect(response.status).toBe(200);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.requiredRole).toBe("devops");
  });

  it("agent moving task to in-review sets requiredRole to code-review", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "in-progress", "coding");
    setAgent(member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/status/${task.id}`, {
      method: "PUT",
      json: { status: "in-review" },
    });
    expect(response.status).toBe(200);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.requiredRole).toBe("code-review");
  });

  it("code-review agent approving a review sets done and releases the review lock", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "in-review", "code-review");
    setAgent(member.user.id, "code-review");
    const { app } = createApp();

    // The reviewer must hold the review lock to finish the review.
    const claimResponse = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(claimResponse.status).toBe(200);

    const response = await agentFetch(app, `/api/task/status/${task.id}`, {
      method: "PUT",
      json: { status: "done" },
    });
    expect(response.status).toBe(200);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.requiredRole).toBeNull();
    expect(persisted?.status).toBe("done");
    expect(persisted?.reviewClaimedBy).toBeNull();
  });

  it("a reviewer cannot resubmit an in-review task to in-review", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "in-review", "coding");
    setAgent(member.user.id, "code-review");
    const { app } = createApp();

    await agentFetch(app, `/api/task/claim/${task.id}`, { method: "POST" });
    const response = await agentFetch(app, `/api/task/status/${task.id}`, {
      method: "PUT",
      json: { status: "in-review" },
    });
    expect(response.status).toBe(409);
  });

  it("a non-reviewer agent cannot pull a task out of in-review", async () => {
    const reviewer = await createTeamMember({ role: "member" });
    const implementer = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: reviewer.team.id,
    });
    const task = await seedTask(project.id, "in-review", "coding");
    await db
      .update(schema.taskTable)
      .set({ userId: implementer.user.id })
      .where(eq(schema.taskTable.id, task.id));
    setAgent(reviewer.user.id, "code-review");
    const { app } = createApp();
    await agentFetch(app, `/api/task/claim/${task.id}`, { method: "POST" });

    // Another coding agent cannot mark the reviewed task done.
    setAgent(implementer.user.id, "coding");
    const response = await agentFetch(app, `/api/task/status/${task.id}`, {
      method: "PUT",
      json: { status: "done" },
    });
    expect(response.status).toBe(403);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.status).toBe("in-review");
  });
});

describe("API integration: agent-created task requiredRole", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
  });

  it("agent-created task gets requiredRole set to agent role", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    setAgent(member.user.id, "architecture-design");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/${project.id}`, {
      method: "POST",
      json: {
        title: "Agent created task",
        description:
          "Set up the onboarding flow.\n\n## Acceptance Criteria\n- New user reaches dashboard",
        priority: "low",
        status: "to-do",
      },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string };
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });
    expect(persisted?.requiredRole).toBe("architecture-design");
  });

  it("agent-created task with explicit requiredRole uses the explicit value", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    setAgent(member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/${project.id}`, {
      method: "POST",
      json: {
        title: "Task with explicit role",
        description:
          "Wire up the testing harness.\n\n## Acceptance Criteria\n- Tests run in CI",
        priority: "low",
        status: "to-do",
        requiredRole: "testing",
      },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string };
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });
    expect(persisted?.requiredRole).toBe("testing");
  });
});

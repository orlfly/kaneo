import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

// Module-level mutable state for the verify-api-key stub. Each test sets the
// agent role metadata before issuing requests; the mock is registered at module
// scope so it is hoisted before the app modules are imported.
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

async function seedTask({
  projectId,
  columnId,
  requiredRole,
  userId = null,
  title,
}: {
  projectId: string;
  columnId: string;
  requiredRole: string | null;
  userId?: string | null;
  title: string;
}) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      userId,
      title,
      description: "seeded",
      status: "to-do",
      columnId,
      priority: "medium",
      number: 1,
      position: 1,
      requiredRole,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function claimAs(apiKeyHeader: string | null, taskId: string) {
  const { app } = createApp();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKeyHeader) headers["x-api-key"] = apiKeyHeader;
  return app.request(`/api/task/claim/${taskId}`, {
    method: "POST",
    headers,
  });
}

async function claimNextAs(apiKeyHeader: string | null, projectId: string) {
  const { app } = createApp();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKeyHeader) headers["x-api-key"] = apiKeyHeader;
  return app.request("/api/task/claim-next", {
    method: "POST",
    headers,
    body: JSON.stringify({ projectId }),
  });
}

function setAgent(userId: string, role: string) {
  currentApiKey = { userId, metadata: { agentRole: role } };
}

describe('API integration: requiredRole = "human"', () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
  });

  it("rejects agent claim (any role) on a human-only task", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask({
      projectId: project.id,
      columnId: columns.todo.id,
      requiredRole: "human",
      title: "Pair with me on this",
    });

    mockAuthenticatedSession(member.user);
    setAgent(member.user.id, "coding");

    const response = await claimAs("mock-agent-key", task.id);
    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain("human");

    const unchanged = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(unchanged?.userId).toBeNull();
  });

  it("also rejects code-review agent on a human-only task", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask({
      projectId: project.id,
      columnId: columns.todo.id,
      requiredRole: "human",
      title: "Human-only review",
    });
    // code-review agents claim in-review tasks, so move the task into in-review
    // (with an assigned reviewer) so the human-only guard is reached.
    await db
      .update(schema.taskTable)
      .set({ status: "in-review", userId: member.user.id })
      .where(eq(schema.taskTable.id, task.id));

    mockAuthenticatedSession(member.user);
    setAgent(member.user.id, "code-review");

    const response = await claimAs("mock-agent-key", task.id);
    expect(response.status).toBe(403);
  });

  it("allows a human session (no API key) to claim a human-only task", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask({
      projectId: project.id,
      columnId: columns.todo.id,
      requiredRole: "human",
      title: "Human-only",
    });

    mockAuthenticatedSession(member.user);

    const response = await claimAs(null, task.id);
    expect(response.status).toBe(200);
    const claimed = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(claimed?.userId).toBe(member.user.id);
    expect(claimed?.status).toBe("in-progress");
  });

  it("allows a human session to claim a generic (null requiredRole) task", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask({
      projectId: project.id,
      columnId: columns.todo.id,
      requiredRole: null,
      title: "Generic",
    });

    mockAuthenticatedSession(member.user);
    const response = await claimAs(null, task.id);
    expect(response.status).toBe(200);
  });

  it("rejects a human session claiming a role-restricted (non-human) task", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask({
      projectId: project.id,
      columnId: columns.todo.id,
      requiredRole: "coding",
      title: "Coding-only",
    });

    mockAuthenticatedSession(member.user);
    const response = await claimAs(null, task.id);
    expect(response.status).toBe(403);

    const unchanged = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(unchanged?.userId).toBeNull();
  });

  it("claim-next excludes human-only tasks for any agent (including code-review)", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });
    await seedTask({
      projectId: project.id,
      columnId: columns.todo.id,
      requiredRole: "human",
      title: "Human-only",
    });

    mockAuthenticatedSession(member.user);
    setAgent(member.user.id, "coding");

    const response = await claimNextAs("mock-agent-key", project.id);
    expect(response.status).toBe(404);
  });

  it("claim-next lets human session pick the human-only task", async () => {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });
    const humanOnly = await seedTask({
      projectId: project.id,
      columnId: columns.todo.id,
      requiredRole: "human",
      title: "Human-only",
    });

    mockAuthenticatedSession(member.user);
    const response = await claimNextAs(null, project.id);
    expect(response.status).toBe(200);
    const claimed = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, humanOnly.id),
    });
    expect(claimed?.userId).toBe(member.user.id);
  });
});

describe('API integration: API key with agentRole = "human" is rejected', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  // Real session cookie jar built from a sign-up flow. The api-key plugin
  // validates the caller via a real Better Auth session (getSessionFromCtx),
  // which `mockAuthenticatedSession` (stubbing auth.api.getSession) cannot
  // satisfy, so we must drive an actual sign-up to obtain a valid cookie.
  function applyCookies(existing: string, response: Response) {
    const jar = new Map<string, string>();
    for (const pair of existing.split("; ").filter(Boolean)) {
      const [name, ...value] = pair.split("=");
      if (name) jar.set(name, value.join("="));
    }
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(";");
      const [name, ...value] = (pair ?? "").split("=");
      if (!name) continue;
      if (value.join("") === "") {
        jar.delete(name);
        continue;
      }
      jar.set(name, value.join("="));
    }
    return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
  }

  async function signUpAndGetCookie(app: ReturnType<typeof createApp>["app"]) {
    let jar = "csrf=1";
    const email = `apikey-${randomUUID()}@example.com`;
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: jar,
        origin: "http://localhost:5173",
      },
      body: JSON.stringify({
        name: "API key test user",
        email,
        password: "correct horse battery staple",
      }),
    });
    expect(signUp.status).toBe(200);
    jar = applyCookies(jar, signUp);
    return jar;
  }

  it('rejects creation of an API key whose metadata.agentRole is "human"', async () => {
    const { app } = createApp();
    const cookieJar = await signUpAndGetCookie(app);

    const response = await app.request("/api/auth/api-key/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieJar,
        origin: "http://localhost:5173",
      },
      body: JSON.stringify({
        name: "bad-human",
        metadata: { agentRole: "human" },
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain("human");
  });

  it("allows creation of an API key with a valid agent role", async () => {
    // Regression: the route-level agentRole guard reads the request body via a
    // fresh clone. If it consumed the original body instead, better-auth would
    // re-read a drained stream and every key creation (even valid ones) would
    // fail with "Body is unusable".
    const { app } = createApp();
    const cookieJar = await signUpAndGetCookie(app);

    const response = await app.request("/api/auth/api-key/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieJar,
        origin: "http://localhost:5173",
      },
      body: JSON.stringify({
        name: "good-coding",
        metadata: { agentRole: "coding" },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      metadata?: unknown;
      key?: string;
    };
    expect(body.key).toBeTruthy();
    expect(body.metadata).toEqual({ agentRole: "coding" });
  });
});

describe("API integration: requiredRole is locked once a task is in-progress or in-review", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function seedAndUpdate({
    status,
    initialRole,
    nextRole,
  }: {
    status: "to-do" | "in-progress" | "in-review";
    initialRole: string | null;
    nextRole: string | null;
  }) {
    const member = await createTeamMember();
    const { project, columns } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask({
      projectId: project.id,
      columnId: columns.todo.id,
      requiredRole: initialRole,
      title: `task-${status}`,
    });
    if (status !== "to-do") {
      await db
        .update(schema.taskTable)
        .set({ status, userId: member.user.id })
        .where(eq(schema.taskTable.id, task.id));
    }

    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const targetColumn =
      status === "in-progress"
        ? columns.inProgress
        : status === "in-review"
          ? columns.inReview
          : columns.todo;
    const response = await app.request(`/api/task/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        priority: "medium",
        status: targetColumn.slug,
        projectId: project.id,
        position: task.position ?? 1,
        requiredRole: nextRole,
      }),
    });
    return { response, task };
  }

  it("allows changing requiredRole on a to-do task", async () => {
    const { response, task } = await seedAndUpdate({
      status: "to-do",
      initialRole: null,
      nextRole: "human",
    });
    expect(response.status).toBe(200);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.requiredRole).toBe("human");
  });

  it("rejects changing requiredRole on an in-progress task", async () => {
    const { response, task } = await seedAndUpdate({
      status: "in-progress",
      initialRole: "coding",
      nextRole: "testing",
    });
    expect(response.status).toBe(409);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.requiredRole).toBe("coding");
  });

  it("rejects changing requiredRole on an in-review task", async () => {
    const { response, task } = await seedAndUpdate({
      status: "in-review",
      initialRole: null,
      nextRole: "human",
    });
    expect(response.status).toBe(409);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.requiredRole).toBeNull();
  });

  it("allows other field changes on an in-progress task without touching requiredRole", async () => {
    const { response, task } = await seedAndUpdate({
      status: "in-progress",
      initialRole: "coding",
      nextRole: "coding",
    });
    expect(response.status).toBe(200);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.requiredRole).toBe("coding");
  });
});

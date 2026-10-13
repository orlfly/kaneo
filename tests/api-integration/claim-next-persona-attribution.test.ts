import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture } from "./helpers/fixtures";

/**
 * Regression for claim-next persona attribution (Kaneo task #57).
 *
 * Several persona API keys (ops / review / coder / tester / arch) may share ONE
 * Kaneo `userId`; the persona lives only in the key's `metadata.agentRole`.
 * `claim-next-task.ts` "rule 1 = my current assignment" matched on
 * `task.userId === caller.userId` and did not filter by `requiredRole`, so any
 * persona's `claim-next` would return another persona's in-progress task and
 * never reach the role-matched to-do pool.
 *
 * The stub below models the two distinct dimensions the fix must respect:
 *   - `userId`    : shared across every persona (the human team member)
 *   - `agentRole` : the persona, from key metadata
 *   - key id      : per-persona, used for `claimedBy` attribution
 */

const SHARED_USER_ID = "shared-persona-user";
const KEY_PREFIX = "mock-agent-key-";

type ApiKeyStub = {
  keyId: string;
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
          id: currentApiKey.keyId,
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

/** Act as a specific persona: same userId, distinct agentRole + key id. */
function setPersona(role: string, keyId = `${KEY_PREFIX}${role}`) {
  currentApiKey = {
    keyId,
    userId: SHARED_USER_ID,
    metadata: { agentRole: role },
  };
}

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

/**
 * A team whose single member is the shared persona user: exactly the real
 * shape, where one human user id backs several persona keys.
 */
async function createSharedPersonaContext() {
  const teamId = `team-${randomUUID()}`;
  const userId = SHARED_USER_ID;

  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: "Shared Persona User",
    })
    .returning();

  const [team] = await db
    .insert(schema.teamTable)
    .values({
      id: teamId,
      createdAt: new Date(),
      name: "Persona Team",
      slug: `team-${randomUUID()}`,
    })
    .returning();

  await db.insert(schema.teamMemberTable).values({
    teamId: team.id,
    userId: user.id,
    role: "owner",
    joinedAt: new Date(),
  });

  const { project } = await createProjectFixture({ teamId: team.id });
  return { user, team, project };
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
  title: string,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
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
      ...overrides,
    })
    .returning();
  return task;
}

describe("API integration: claim-next persona attribution (task #57)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
    projectCounters.clear();
  });

  it("does not return another persona's in-progress task", async () => {
    const { project } = await createSharedPersonaContext();

    // The tester persona is already working a task, attributed to ITS key.
    const testerTask = await seedTask(
      project.id,
      "in-progress",
      "testing",
      "Tester is working this",
      {
        userId: SHARED_USER_ID,
        claimedBy: `${KEY_PREFIX}testing`,
        claimedAt: new Date(),
        dueDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    );
    // A coding to-do task is free; this is what the coder must receive.
    const codingTask = await seedTask(
      project.id,
      "to-do",
      "coding",
      "Free for coder",
    );

    setPersona("coding");
    const { app } = createApp();
    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { taskId: string };
    // The persona-mismatched in-progress task must never be handed back.
    expect(payload.taskId).not.toBe(testerTask.id);
    expect(payload.taskId).toBe(codingTask.id);

    // The tester's task is untouched: no attribution, status, or claim change.
    const testerRow = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, testerTask.id),
    });
    expect(testerRow?.userId).toBe(SHARED_USER_ID);
    expect(testerRow?.claimedBy).toBe(`${KEY_PREFIX}testing`);
    expect(testerRow?.status).toBe("in-progress");
  });

  it("resumes the caller persona's own in-progress rework via claim-next", async () => {
    const { project } = await createSharedPersonaContext();

    const rework = await seedTask(
      project.id,
      "in-progress",
      "coding",
      "My rework task",
      {
        userId: SHARED_USER_ID,
        claimedBy: `${KEY_PREFIX}coding`,
        claimedAt: new Date(),
      },
    );
    // Another persona's in-progress task with an earlier due date used to win
    // the rule-1 ordering and mask the caller's own rework.
    await seedTask(project.id, "in-progress", "testing", "Tester task", {
      userId: SHARED_USER_ID,
      claimedBy: `${KEY_PREFIX}testing`,
      claimedAt: new Date(),
      dueDate: new Date("2026-01-01T00:00:00.000Z"),
    });

    setPersona("coding");
    const { app } = createApp();
    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      taskId: string;
      status: string;
      resumed: boolean;
    };
    expect(payload.taskId).toBe(rework.id);
    expect(payload.status).toBe("in-progress");
    // Resuming already-held work must be distinguishable from a new claim.
    expect(payload.resumed).toBe(true);
  });

  it("does not mark a freshly claimed to-do task as resumed", async () => {
    const { project } = await createSharedPersonaContext();
    const free = await seedTask(project.id, "to-do", "coding", "Fresh to-do");
    setPersona("coding");
    const { app } = createApp();
    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      taskId: string;
      status: string;
      resumed: boolean;
    };
    expect(payload.taskId).toBe(free.id);
    expect(payload.status).toBe("in-progress");
    expect(payload.resumed).toBe(false);
  });

  it("still resumes the caller's own in-progress task for human callers", async () => {
    const { user, project } = await createSharedPersonaContext();
    const mine = await seedTask(
      project.id,
      "in-progress",
      null,
      "Human own task",
      { userId: user.id, claimedBy: null, claimedAt: new Date() },
    );

    // No API key on this call: the human falls back to userId attribution.
    currentApiKey = null;
    const { claimNextTask } = await import(
      "../../apps/api/src/task/controllers/claim-next-task"
    );
    const result = await claimNextTask({
      userId: user.id,
      projectId: project.id,
    });
    expect(result?.taskId).toBe(mine.id);
    expect(result?.status).toBe("in-progress");
  });

  it("still resumes the caller's own in-progress rework by direct claim-next with a key", async () => {
    const { project } = await createSharedPersonaContext();
    // Task was returned for rework: requiredRole is cleared, status in-progress,
    // and the original coder key still owns the claim.
    const rework = await seedTask(
      project.id,
      "in-progress",
      null,
      "Rework sent back",
      {
        userId: SHARED_USER_ID,
        claimedBy: `${KEY_PREFIX}coding`,
        claimedAt: new Date(),
      },
    );
    setPersona("coding");
    const { app } = createApp();
    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { taskId: string };
    expect(payload.taskId).toBe(rework.id);
  });
});

describe("API integration: claim-next persona attribution keeps other rules intact", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
    projectCounters.clear();
  });

  it("code-review still resumes its own review lock before claiming free work", async () => {
    const { project } = await createSharedPersonaContext();
    const mine = await seedTask(project.id, "in-review", "coding", "Mine");
    const other = await seedTask(project.id, "in-review", "testing", "Other");
    setPersona("code-review");
    const { app } = createApp();

    const first = await agentFetch(app, `/api/task/claim/${mine.id}`, {
      method: "POST",
    });
    expect(first.status).toBe(200);

    const second = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(second.status).toBe(200);
    const payload = (await second.json()) as { taskId: string };
    expect(payload.taskId).toBe(mine.id);
    const free = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, other.id),
    });
    expect(free?.reviewClaimedBy).toBeNull();
  });

  it("coding still claims a free to-do task when it has no in-progress work", async () => {
    const { project } = await createSharedPersonaContext();
    const free = await seedTask(project.id, "to-do", null, "Generic to-do");
    setPersona("coding");
    const { app } = createApp();
    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { taskId: string };
    expect(payload.taskId).toBe(free.id);
  });

  it("a persona with no matching work gets 404 rather than another persona's task", async () => {
    const { project } = await createSharedPersonaContext();
    // Only a testing task exists; a coder must not be given it.
    await seedTask(project.id, "in-progress", "testing", "Tester task", {
      userId: SHARED_USER_ID,
      claimedBy: `${KEY_PREFIX}testing`,
      claimedAt: new Date(),
    });
    setPersona("coding");
    const { app } = createApp();
    const response = await agentFetch(app, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(404);
  });
});

describe("API integration: direct claim persona attribution (same userId, distinct keys)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
    projectCounters.clear();
  });

  it("does not resume another persona's in-progress task", async () => {
    // Same premise as the claim-next suite: one human, two personas whose keys
    // share the userId. The direct `/claim/{id}` path used to authorize on
    // `userId` alone, so the coding persona silently resumed the tester's task.
    const { project, user } = await createSharedPersonaContext();
    const task = await seedTask(
      project.id,
      "in-progress",
      "testing",
      "Tester task",
    );
    const testerKeyId = "mock-agent-key-tester";
    await db
      .update(schema.taskTable)
      .set({
        userId: user.id,
        claimedBy: testerKeyId,
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, task.id));

    setPersona("coding");
    const { app } = createApp();

    // The task is not the coder's to resume: the claim is refused (409 = not
    // claimable in its current state; pre-fix this returned 200 `resumed:true`
    // even though another persona held the task).
    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(409);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.claimedBy).toBe(testerKeyId);
    expect(persisted?.status).toBe("in-progress");
  });

  it("still resumes the caller's own in-progress rework task", async () => {
    const { project, user } = await createSharedPersonaContext();
    // The reviewer cleared requiredRole and returned the task for rework; the
    // owning persona (same key) resumes it as a no-op.
    const task = await seedTask(project.id, "in-progress", null, "Rework");
    const coderKeyId = "mock-agent-key-coding";
    await db
      .update(schema.taskTable)
      .set({
        userId: user.id,
        claimedBy: coderKeyId,
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, task.id));

    setPersona("coding", coderKeyId);
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      resumed?: boolean;
    };
    expect(payload.status).toBe("in-progress");
    expect(payload.resumed).toBe(true);
  });

  it("claims an assigned-but-unclaimed task that matches the caller's role", async () => {
    const { project, user } = await createSharedPersonaContext();
    // Assigned to the shared user, not yet held by any persona key.
    const task = await seedTask(
      project.id,
      "to-do",
      "coding",
      "Unclaimed assigned work",
    );
    await db
      .update(schema.taskTable)
      .set({ userId: user.id })
      .where(eq(schema.taskTable.id, task.id));

    setPersona("coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.claimedBy).toBe(currentApiKey?.keyId);
  });

  it("refuses a role-mismatched task even when it is assigned to the shared user", async () => {
    const { project, user } = await createSharedPersonaContext();
    const task = await seedTask(
      project.id,
      "to-do",
      "architecture-design",
      "Arch work",
    );
    await db
      .update(schema.taskTable)
      .set({ userId: user.id })
      .where(eq(schema.taskTable.id, task.id));

    setPersona("coding");
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/claim/${task.id}`, {
      method: "POST",
    });
    expect(response.status).toBe(403);
  });
});

describe("API integration: activity persona attribution (shared userId)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
    projectCounters.clear();
  });

  it("records the acting persona key on a status change", async () => {
    const { project, user } = await createSharedPersonaContext();
    const task = await seedTask(
      project.id,
      "to-do",
      "coding",
      "Status attribution",
    );
    await db
      .update(schema.taskTable)
      .set({ userId: user.id })
      .where(eq(schema.taskTable.id, task.id));

    const coderKeyId = "mock-agent-key-coding";
    setPersona("coding", coderKeyId);
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/status/${task.id}`, {
      method: "PUT",
      json: { status: "in-progress" },
    });
    expect(response.status).toBe(200);

    // `userId` is shared by every persona of this human, so the activity row
    // must carry the key that acted or the feed cannot name the role. The row
    // is written by the async event subscriber, so wait for it.
    const entry = await vi.waitFor(
      async () => {
        const row = await db.query.activityTable.findFirst({
          where: and(
            eq(schema.activityTable.taskId, task.id),
            eq(schema.activityTable.type, "status_changed"),
          ),
        });
        expect(row?.agentKeyId).toBe(coderKeyId);
        return row;
      },
      { timeout: 5000 },
    );
    expect(entry?.type).toBe("status_changed");
  });

  it("records the acting persona key on a comment", async () => {
    const { project } = await createSharedPersonaContext();
    const task = await seedTask(
      project.id,
      "in-progress",
      "coding",
      "Comment attribution",
    );

    const archKeyId = "mock-agent-key-arch";
    setPersona("architecture-design", archKeyId);
    const { app } = createApp();

    const response = await agentFetch(app, `/api/comment/${task.id}`, {
      method: "POST",
      json: { content: "## 返工完成" },
    });
    expect(response.status).toBe(200);

    const entry = await db.query.activityTable.findFirst({
      where: and(
        eq(schema.activityTable.taskId, task.id),
        eq(schema.activityTable.type, "comment"),
      ),
    });
    expect(entry?.agentKeyId).toBe(archKeyId);
  });
});

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

/**
 * Regression for Kaneo #57 / #78: persona attribution in `claim-next`.
 *
 * Real deployments give every agent persona of one human its own API key that
 * shares the same `userId` (`reference_id`); the persona lives only in
 * `metadata.agentRole`. The pre-fix rule 1 matched rule-1 candidates by
 * `userId`, so every persona saw (and shadowed) every other persona's
 * in-progress work.
 *
 * The existing suites cannot express this premise: their `verifyApiKey` mock
 * derives the key id from the userId (`mock-agent-key-<userId>`), so two
 * personas sharing a userId would share a keyId. This file mocks the key id
 * per key NAME instead, which is the minimal change needed to construct
 * "same userId, different keyId, different agentRole".
 */
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
      // The raw key IS the key id here, so two personas of the same user get
      // distinct key ids — the premise the other suites cannot express.
      if (rawKey !== currentApiKey.keyId) return null;
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

async function agentFetch(
  app: Awaited<ReturnType<typeof createApp>>["app"],
  keyId: string,
  path: string,
  init: { method?: string; json?: unknown } = {},
) {
  const headers: Record<string, string> = { "x-api-key": keyId };
  let body: string | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  return app.request(path, { method: init.method, headers, body });
}

function setAgent(keyId: string, userId: string, role: string) {
  currentApiKey = { keyId, userId, metadata: { agentRole: role } };
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

describe("API integration: claim-next persona attribution (Kaneo #57/#78)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
    projectCounters.clear();
  });

  it("does not return another persona's in-progress task to this persona", async () => {
    // ONE human member; two agent personas (keys) share their userId.
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    // Tester persona holds an in-progress task (as if claimed then requiredRole
    // auto-flowed); coding persona asks claim-next.
    const task = await seedTask(project.id, "in-progress", "testing");
    const testerKeyId = "mock-agent-key-tester";
    await db
      .update(schema.taskTable)
      .set({
        userId: member.user.id,
        claimedBy: testerKeyId,
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, task.id));

    const coderKeyId = "mock-agent-key-coder";
    setAgent(coderKeyId, member.user.id, "coding");
    const { app } = createApp();

    // Pre-fix (rule 1 matched by userId) this returned the tester's task and
    // shadowed new coding work. Post-fix it must be an empty result.
    const response = await agentFetch(app, coderKeyId, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(404);

    // The tester's task is untouched.
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.claimedBy).toBe(testerKeyId);
    expect(persisted?.status).toBe("in-progress");
  });

  it("still resumes the persona's own in-progress task with resumed: true", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    // Coding persona's own task sent back for rework: in-progress,
    // requiredRole cleared by the review flow.
    const task = await seedTask(project.id, "in-progress", null);
    const coderKeyId = "mock-agent-key-coder";
    await db
      .update(schema.taskTable)
      .set({
        userId: member.user.id,
        claimedBy: coderKeyId,
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, task.id));

    setAgent(coderKeyId, member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, coderKeyId, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      taskId: string;
      resumed: boolean;
      claimed: boolean;
      status: string;
    };
    expect(body.taskId).toBe(task.id);
    expect(body.resumed).toBe(true);
    expect(body.claimed).toBe(true);
    expect(body.status).toBe("in-progress");
  });

  it("red under the reverted rule: userId-matching would leak across personas", async () => {
    // Documents the discriminating power of test 1: with the pre-fix rule the
    // same setup yields the other persona's task with 200. This assertion is
    // the invariant the fix restored; kept explicit so a revert fails here
    // with a readable message rather than only via the 404 above.
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "in-progress", "testing");
    const testerKeyId = "mock-agent-key-tester";
    await db
      .update(schema.taskTable)
      .set({
        userId: member.user.id,
        claimedBy: testerKeyId,
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, task.id));

    const coderKeyId = "mock-agent-key-coder";
    setAgent(coderKeyId, member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, coderKeyId, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    if (response.status === 200) {
      const body = (await response.json()) as { taskId: string };
      expect.fail(
        `persona leak (pre-fix rule): coding claim-next returned tester's task ${body.taskId}`,
      );
    } else {
      expect(response.status).toBe(404);
    }
  });

  it("same-role multi-key: a second coding key does not get the first coding key's in-progress task", async () => {
    // The ONLY case that discriminates fix #1 (attribute rule-1 candidates by
    // claimedBy/agentKeyId) from fix #2 (merely add a requiredRole filter to
    // rule 1): two keys of the SAME role sharing one userId. Fix #2 alone
    // still leaks here because the role filter passes; the claimedBy match
    // does not. Under fix #2 only, this test goes red.
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "in-progress", "coding");
    const keyA = "mock-agent-key-coder-a";
    await db
      .update(schema.taskTable)
      .set({
        userId: member.user.id,
        claimedBy: keyA,
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, task.id));

    const keyB = "mock-agent-key-coder-b";
    setAgent(keyB, member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(app, keyB, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    if (response.status === 200) {
      const body = (await response.json()) as { taskId: string };
      expect.fail(
        `same-role key leak: keyB claim-next returned keyA's task ${body.taskId}`,
      );
    }
    expect(response.status).toBe(404);

    // keyA's task untouched; and keyA still resumes it via rule 1.
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.claimedBy).toBe(keyA);
    expect(persisted?.status).toBe("in-progress");

    setAgent(keyA, member.user.id, "coding");
    const resume = await agentFetch(app, keyA, "/api/task/claim-next", {
      method: "POST",
      json: {},
    });
    expect(resume.status).toBe(200);
    const resumeBody = (await resume.json()) as {
      taskId: string;
      resumed: boolean;
    };
    expect(resumeBody.taskId).toBe(task.id);
    expect(resumeBody.resumed).toBe(true);
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
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "in-progress", "testing");
    const testerKeyId = "mock-agent-key-tester";
    await db
      .update(schema.taskTable)
      .set({
        userId: member.user.id,
        claimedBy: testerKeyId,
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, task.id));

    const coderKeyId = "mock-agent-key-coder";
    setAgent(coderKeyId, member.user.id, "coding");
    const { app } = createApp();

    // The task is not the coder's to resume: the claim is refused (409 = not
    // claimable in its current state; pre-fix this returned 200 `resumed:true`
    // even though another persona held the task).
    const response = await agentFetch(
      app,
      coderKeyId,
      `/api/task/claim/${task.id}`,
      {
        method: "POST",
      },
    );
    expect(response.status).toBe(409);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.claimedBy).toBe(testerKeyId);
    expect(persisted?.status).toBe("in-progress");
  });

  it("still resumes the caller's own in-progress rework task", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    // The reviewer cleared requiredRole and returned the task for rework; the
    // owning persona (same key) resumes it as a no-op.
    const task = await seedTask(project.id, "in-progress", null);
    const coderKeyId = "mock-agent-key-coder";
    await db
      .update(schema.taskTable)
      .set({
        userId: member.user.id,
        claimedBy: coderKeyId,
        claimedAt: new Date(),
      })
      .where(eq(schema.taskTable.id, task.id));

    setAgent(coderKeyId, member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(
      app,
      coderKeyId,
      `/api/task/claim/${task.id}`,
      {
        method: "POST",
      },
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      resumed?: boolean;
    };
    expect(payload.status).toBe("in-progress");
    expect(payload.resumed).toBe(true);
  });

  it("claims an assigned-but-unclaimed task that matches the caller's role", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    // Assigned to the shared user, not yet held by any persona key.
    const task = await seedTask(project.id, "to-do", "coding");
    await db
      .update(schema.taskTable)
      .set({ userId: member.user.id })
      .where(eq(schema.taskTable.id, task.id));

    const coderKeyId = "mock-agent-key-coder";
    setAgent(coderKeyId, member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(
      app,
      coderKeyId,
      `/api/task/claim/${task.id}`,
      {
        method: "POST",
      },
    );
    expect(response.status).toBe(200);
    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.claimedBy).toBe(coderKeyId);
  });

  it("refuses a role-mismatched task even when it is assigned to the shared user", async () => {
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "to-do", "architecture-design");
    await db
      .update(schema.taskTable)
      .set({ userId: member.user.id })
      .where(eq(schema.taskTable.id, task.id));

    const coderKeyId = "mock-agent-key-coder";
    setAgent(coderKeyId, member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(
      app,
      coderKeyId,
      `/api/task/claim/${task.id}`,
      {
        method: "POST",
      },
    );
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
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "to-do", "coding");
    await db
      .update(schema.taskTable)
      .set({ userId: member.user.id })
      .where(eq(schema.taskTable.id, task.id));

    const coderKeyId = "mock-agent-key-coder";
    setAgent(coderKeyId, member.user.id, "coding");
    const { app } = createApp();

    const response = await agentFetch(
      app,
      coderKeyId,
      `/api/task/status/${task.id}`,
      { method: "PUT", json: { status: "in-progress" } },
    );
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
    const member = await createTeamMember({ role: "member" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const task = await seedTask(project.id, "in-progress", "coding");

    const archKeyId = "mock-agent-key-arch";
    setAgent(archKeyId, member.user.id, "architecture-design");
    const { app } = createApp();

    const response = await agentFetch(
      app,
      archKeyId,
      `/api/comment/${task.id}`,
      { method: "POST", json: { content: "## 返工完成" } },
    );
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

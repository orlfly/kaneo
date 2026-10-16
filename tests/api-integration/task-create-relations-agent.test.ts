import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

// Agents call the API with a key, not a browser session, and that path adds its
// own rules (Acceptance Criteria in the description, requiredRole defaulting).
// This file exercises task creation with declared relations through the key.
type ApiKeyStub = {
  userId: string;
  metadata: Record<string, unknown> | null;
};
let currentApiKey: ApiKeyStub | null = null;

const AGENT_KEY_ID = "mock-agent-key-relations";

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
          id: AGENT_KEY_ID,
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

const ACCEPTANCE_DESCRIPTION =
  "## Context\nNeeded before the blocked task can start.\n\n## Acceptance Criteria\n- the schema exists";

async function agentFetch(
  app: Awaited<ReturnType<typeof createApp>>["app"],
  path: string,
  init: { method?: string; json?: unknown } = {},
) {
  const headers: Record<string, string> = { "x-api-key": "mock-agent-key" };
  let body: string | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  return app.request(path, { method: init.method, headers, body });
}

beforeEach(async () => {
  await resetTestDatabase();
  currentApiKey = null;
});

describe("API integration: agent task creation with relations", () => {
  it("creates the task and its relation through an API key", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const [blocked] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Blocked task", number: 1 })
      .returning();

    currentApiKey = {
      userId: member.user.id,
      metadata: { agentRole: "devops" },
    };
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/${project.id}`, {
      method: "POST",
      json: {
        title: "Prepare the schema for the blocked task",
        description: ACCEPTANCE_DESCRIPTION,
        priority: "high",
        status: "to-do",
        startDate: "2026-08-01",
        dueDate: "2026-08-04",
        relations: [{ targetTaskId: blocked.id, relationType: "blocks" }],
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      requiredRole: string | null;
      relations?: Array<{ id: string; targetTaskId: string }>;
    };

    // An agent-created task without an explicit requiredRole is routed back to
    // the creating role, and the relation lands with it.
    expect(payload.requiredRole).toBe("devops");
    expect(payload.relations).toHaveLength(1);
    expect(payload.relations?.[0]?.targetTaskId).toBe(blocked.id);

    const rows = await db
      .select()
      .from(schema.taskRelationTable)
      .where(eq(schema.taskRelationTable.sourceTaskId, payload.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].relationType).toBe("blocks");
  });

  it("still enforces the agent quality gate before creating a task with relations", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const [blocked] = await db
      .insert(schema.taskTable)
      .values({ projectId: project.id, title: "Blocked task", number: 1 })
      .returning();

    currentApiKey = {
      userId: member.user.id,
      metadata: { agentRole: "coding" },
    };
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/${project.id}`, {
      method: "POST",
      json: {
        title: "Missing acceptance criteria",
        description: "Just a short note with no done-condition at all.",
        priority: "low",
        status: "to-do",
        relations: [{ targetTaskId: blocked.id, relationType: "blocks" }],
      },
    });

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain("Acceptance Criteria");
    const tasks = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(tasks).toHaveLength(1); // only the seeded blocked task
    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(0);
  });

  it("creates no task when an agent names a target it cannot reach", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    currentApiKey = {
      userId: member.user.id,
      metadata: { agentRole: "coding" },
    };
    const { app } = createApp();

    const response = await agentFetch(app, `/api/task/${project.id}`, {
      method: "POST",
      json: {
        title: "Prerequisite for an unknown task",
        description: ACCEPTANCE_DESCRIPTION,
        priority: "low",
        status: "to-do",
        relations: [{ targetTaskId: "missing-task", relationType: "blocks" }],
      },
    });

    expect(response.status).toBe(404);
    const tasks = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(tasks).toHaveLength(0);
  });
});

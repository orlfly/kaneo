import { beforeEach, describe, expect, it, vi } from "vitest";
import db from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

// Module-level mutable state for the verify-api-key stub. Registered at module
// scope so it is hoisted before the app modules are imported; each test sets
// the agent role metadata before issuing requests.
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

function setAgent(userId: string, role: string) {
  currentApiKey = { userId, metadata: { agentRole: role } };
}

const VALID_DESCRIPTION =
  "Ship a plain English title.\n\n## Acceptance Criteria\n- Title is readable";

async function createTaskAs(
  projectId: string,
  body: Record<string, unknown>,
  { apiKey }: { apiKey?: string } = {},
) {
  const { app } = createApp();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  return app.request(`/api/task/${projectId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("API integration: task creation quality rules", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    currentApiKey = null;
  });

  it("rejects a branch-name title with 400", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);

    const response = await createTaskAs(project.id, {
      title: "feat/auth",
      description: VALID_DESCRIPTION,
      priority: "low",
      status: "to-do",
    });
    expect(response.status).toBe(400);
  });

  it("rejects a SHA-only title with 400", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);

    const response = await createTaskAs(project.id, {
      title: "1a2b3c4d",
      description: VALID_DESCRIPTION,
      priority: "low",
      status: "to-do",
    });
    expect(response.status).toBe(400);
  });

  it("rejects a too-short title with 400", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);

    const response = await createTaskAs(project.id, {
      title: "Short",
      description: VALID_DESCRIPTION,
      priority: "low",
      status: "to-do",
    });
    expect(response.status).toBe(400);
  });

  it("rejects an agent description without Acceptance Criteria with 400", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);
    setAgent(member.user.id, "coding");

    const response = await createTaskAs(
      project.id,
      {
        title: "Fix the login flow bug",
        description:
          "A short description that has no explicit done-condition section.",
        priority: "low",
        status: "to-do",
        requiredRole: "coding",
      },
      { apiKey: "mock-agent-key" },
    );
    expect(response.status).toBe(400);
  });

  it("accepts an agent description with Acceptance Criteria", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);
    setAgent(member.user.id, "coding");

    const response = await createTaskAs(
      project.id,
      {
        title: "Fix the login flow bug",
        description: VALID_DESCRIPTION,
        priority: "low",
        status: "to-do",
        requiredRole: "coding",
      },
      { apiKey: "mock-agent-key" },
    );
    expect(response.status).toBe(200);
  });

  it("defaults an agent's omitted requiredRole to the agent's own role", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);
    setAgent(member.user.id, "coding");

    const response = await createTaskAs(
      project.id,
      {
        title: "Fix the login flow bug",
        description: VALID_DESCRIPTION,
        priority: "low",
        status: "to-do",
      },
      { apiKey: "mock-agent-key" },
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string };
    const persisted = await db.query.taskTable.findFirst({
      where: (t, { eq }) => eq(t.id, payload.id),
    });
    expect(persisted?.requiredRole).toBe("coding");
  });

  it("accepts an agent with requiredRole set and stores the role", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);
    setAgent(member.user.id, "coding");

    const response = await createTaskAs(
      project.id,
      {
        title: "Fix the login flow bug",
        description: VALID_DESCRIPTION,
        priority: "low",
        status: "to-do",
        requiredRole: "coding",
      },
      { apiKey: "mock-agent-key" },
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string };
    const persisted = await db.query.taskTable.findFirst({
      where: (t, { eq }) => eq(t.id, payload.id),
    });
    expect(persisted?.requiredRole).toBe("coding");
  });

  it("accepts a human session without requiredRole and stores NULL", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);

    const response = await createTaskAs(project.id, {
      title: "Fix the login flow bug",
      description: VALID_DESCRIPTION,
      priority: "low",
      status: "to-do",
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string };
    const persisted = await db.query.taskTable.findFirst({
      where: (t, { eq }) => eq(t.id, payload.id),
    });
    expect(persisted?.requiredRole).toBeNull();
  });
});

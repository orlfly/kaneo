import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { decryptSecret } from "../../apps/api/src/notification-preferences/secrets";
import createTaskController from "../../apps/api/src/task/controllers/create-task";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

type RecordedEvent = {
  type: string;
  data: unknown;
};

const recordedEvents: RecordedEvent[] = [];
let subscribersInitialized = false;

function initEventSubscribers() {
  if (subscribersInitialized) return;
  subscribersInitialized = true;
  subscribeToEvent("task.created", async (data) => {
    recordedEvents.push({ type: "task.created", data });
  });
}

async function createAdmin() {
  const userId = `chat-admin-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: "Chat Admin",
      role: "admin",
    })
    .returning();
  return user;
}

async function readStoredEncrypted() {
  const [row] = await db
    .select({ apiKeyEncrypted: schema.chatConfigTable.apiKeyEncrypted })
    .from(schema.chatConfigTable)
    .where(eq(schema.chatConfigTable.id, "default"))
    .limit(1);
  return row?.apiKeyEncrypted ?? null;
}

describe("API integration: pi-agent chat", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    recordedEvents.length = 0;
    initEventSubscribers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires authentication for the admin config endpoint", async () => {
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request("/api/chat/config");
    expect(response.status).toBe(401);
  });

  it("rejects non-admin access to the chat config", async () => {
    const member = await createTeamMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/chat/config");
    expect(response.status).toBe(403);
  });

  it("reports an empty config as disabled and masks the key", async () => {
    const admin = await createAdmin();
    mockAuthenticatedSession(admin);
    const { app } = createApp();

    const response = await app.request("/api/chat/config");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: "",
      workdirRoot: null,
      enableCommandExecution: false,
      commandTimeoutMs: 60000,
    });

    const status = await (await app.request("/api/chat/status")).json();
    expect(status).toEqual({ enabled: false });
  });

  it("persists the config with an encrypted key and reports enabled", async () => {
    const admin = await createAdmin();
    mockAuthenticatedSession(admin);
    const { app } = createApp();

    const response = await app.request("/api/chat/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        baseUrl: "https://mock.example/v1",
        apiKey: "sk-integration-test-key",
        model: "gpt-4o",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      enabled: true,
      baseUrl: "https://mock.example/v1",
      apiKey: "********",
      model: "gpt-4o",
    });

    const stored = await readStoredEncrypted();
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("sk-integration-test-key");
    expect(stored && decryptSecret(stored)).toBe("sk-integration-test-key");

    const status = await (await app.request("/api/chat/status")).json();
    expect(status).toEqual({ enabled: true });
  });

  it("keeps the stored key when the form echoes the mask", async () => {
    const admin = await createAdmin();
    mockAuthenticatedSession(admin);
    const { app } = createApp();

    const save = (apiKey: string) =>
      app.request("/api/chat/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          baseUrl: "https://mock.example/v1",
          apiKey,
          model: "gpt-4o",
        }),
      });

    await save("sk-integration-test-key");
    const first = await readStoredEncrypted();

    const masked = await save("********");
    expect(masked.status).toBe(200);
    expect(await readStoredEncrypted()).toBe(first);

    const cleared = await save("");
    expect(cleared.status).toBe(200);
    expect(await readStoredEncrypted()).toBeNull();
  });

  it("rejects a config save missing required fields", async () => {
    const admin = await createAdmin();
    mockAuthenticatedSession(admin);
    const { app } = createApp();

    const response = await app.request("/api/chat/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    expect(response.status).toBe(400);
  });

  it("scopes message history to the caller's team", async () => {
    const owner = await createTeamMember();
    const outsider = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: owner.team.id,
    });

    // An authenticated user from another team cannot read the history.
    mockAuthenticatedSession(outsider.user);
    let response = await appRequest(`/api/chat/project/${project.id}`);
    expect(response.status).toBe(403);

    // Unauthenticated requests are rejected by the global API auth.
    mockAnonymousSession();
    response = await appRequest(`/api/chat/project/${project.id}`);
    expect(response.status).toBe(401);

    // A team member sees an empty history.
    mockAuthenticatedSession(owner.user);
    response = await appRequest(`/api/chat/project/${project.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("returns 503 when sending a message while pi-agent is disabled", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/chat/project/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "pi-agent not configured" });
  });

  it("streams an SSE reply, persists both messages, and clears history", async () => {
    const admin = await createAdmin();
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    // Enable the assistant as an admin first.
    mockAuthenticatedSession(admin);
    let app = createApp().app;
    await app.request("/api/chat/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        baseUrl: "https://mock.example",
        apiKey: "sk-integration-test-key",
        model: "gpt-4o",
      }),
    });

    // The user message triggers a non-streaming completion round that
    // returns no tool calls, so the text is streamed back to the client.
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: "嗨，可以帮你管理任务！" },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);
    mockAuthenticatedSession(member.user);
    app = createApp().app;

    const response = await app.request(`/api/chat/project/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "你好，帮我看看项目" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    // The client receives token events plus a done event with a message id.
    const stream = await response.text();
    expect(stream).toContain("event: token");
    expect(stream).toContain("嗨，可以帮你管理任务！");
    expect(stream).toContain("event: done");

    // The completion request hit the OpenAI-compatible endpoint with tools.
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://mock.example/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages).toContainEqual({
      role: "user",
      content: "你好，帮我看看项目",
    });
    expect(
      body.tools.some(
        (t: { function: { name: string } }) => t.function.name === "list_tasks",
      ),
    ).toBe(true);

    // Both the user and assistant messages are persisted.
    const persisted = await db
      .select({
        role: schema.chatMessageTable.role,
        content: schema.chatMessageTable.content,
      })
      .from(schema.chatMessageTable)
      .where(eq(schema.chatMessageTable.projectId, project.id))
      .orderBy(schema.chatMessageTable.createdAt);

    expect(persisted.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(persisted[1].content).toContain("嗨，可以帮你管理任务！");

    // History is served back to the member.
    const history = await (
      await app.request(`/api/chat/project/${project.id}`)
    ).json();
    expect(history).toHaveLength(2);

    // Clearing removes the conversation.
    const cleared = await app.request(`/api/chat/project/${project.id}`, {
      method: "DELETE",
    });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ cleared: true });

    const emptyHistory = await (
      await app.request(`/api/chat/project/${project.id}`)
    ).json();
    expect(emptyHistory).toEqual([]);
  });

  it("executes a create_task tool call and streams the result", async () => {
    const admin = await createAdmin();
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    mockAuthenticatedSession(admin);
    let app = createApp().app;
    await app.request("/api/chat/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        baseUrl: "https://mock.example",
        apiKey: "sk-integration-test-key",
        model: "gpt-4o",
      }),
    });

    // Round 1 asks to create a task; round 2 reports success without tools.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "",
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "create_task",
                        arguments: JSON.stringify({
                          title: "集成测试任务",
                          priority: "high",
                        }),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "任务已创建！",
                  finish_reason: "stop",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);
    mockAuthenticatedSession(member.user);
    app = createApp().app;

    const response = await app.request(`/api/chat/project/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "帮我创建高优先级任务" }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain("任务已创建！");

    // The tool actually created a task in the project.
    const tasks = await db
      .select({
        id: schema.taskTable.id,
        title: schema.taskTable.title,
        status: schema.taskTable.status,
        priority: schema.taskTable.priority,
        number: schema.taskTable.number,
        position: schema.taskTable.position,
        pausedReason: schema.taskTable.pausedReason,
        claimedBy: schema.taskTable.claimedBy,
        requiredRole: schema.taskTable.requiredRole,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("集成测试任务");
    expect(tasks[0].status).toBe("to-do");
    expect(tasks[0].priority).toBe("high");
    expect(tasks[0].number).toBeGreaterThan(0);
    expect(tasks[0].position).toBeGreaterThan(0);
    expect(tasks[0].pausedReason).toBeNull();
    expect(tasks[0].claimedBy).toBeNull();
    expect(tasks[0].requiredRole).toBeNull();

    // Routing through the controller publishes task.created so realtime
    // subscribers (Board, Backlog, activity feed) see the new row.
    expect(
      recordedEvents.some(
        (event) =>
          event.type === "task.created" &&
          (event.data as { taskId?: string }).taskId === tasks[0].id,
      ),
    ).toBe(true);
  });

  it("emits a progress event before each tool call ahead of any token", async () => {
    const admin = await createAdmin();
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    mockAuthenticatedSession(admin);
    let app = createApp().app;
    await app.request("/api/chat/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        baseUrl: "https://mock.example",
        apiKey: "sk-integration-test-key",
        model: "gpt-4o",
      }),
    });

    // Round 1 emits a list_tasks tool call; round 2 answers in prose.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "",
                  tool_calls: [
                    {
                      id: "call_list",
                      type: "function",
                      function: {
                        name: "list_tasks",
                        arguments: "{}",
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "当前任务列表为空。",
                  finish_reason: "stop",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);
    mockAuthenticatedSession(member.user);
    app = createApp().app;

    const response = await app.request(`/api/chat/project/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "列出任务" }),
    });

    expect(response.status).toBe(200);
    const stream = await response.text();

    // The SSE payload must contain a progress event for the list_tasks tool,
    // emitted before any token event.
    const progressOffset = stream.indexOf("event: progress");
    const tokenOffset = stream.indexOf("event: token");
    expect(progressOffset).toBeGreaterThanOrEqual(0);
    expect(tokenOffset).toBeGreaterThan(progressOffset);

    // The progress payload includes the tool name and a label.
    const progressMatch = stream.match(/event: progress\ndata: (\{.*?\})\n/);
    expect(progressMatch).not.toBeNull();
    const progressPayload = JSON.parse(progressMatch?.[1] ?? "{}");
    expect(progressPayload.tool).toBe("list_tasks");
    expect(typeof progressPayload.label).toBe("string");
    expect(progressPayload.label.length).toBeGreaterThan(0);
    expect(progressPayload.round).toBe(0);

    // Final events still arrive.
    expect(stream).toContain("event: done");
  });

  it("routes agent tools through the tool-execute endpoint with team auth", async () => {
    const member = await createTeamMember();
    const outsider = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    const { app } = createApp();

    // The tool-execute endpoint is protected by team access.
    mockAuthenticatedSession(outsider.user);
    let response = await app.request(`/api/chat/project/${project.id}/tool`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "agent_list_files", args: {} }),
    });
    expect(response.status).toBe(403);

    // Unauthenticated requests are rejected by the global API auth.
    mockAnonymousSession();
    response = await app.request(`/api/chat/project/${project.id}/tool`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "agent_list_files", args: {} }),
    });
    expect(response.status).toBe(401);

    // A team member can execute a tool; the result is the tool's JSON string.
    mockAuthenticatedSession(member.user);
    response = await app.request(`/api/chat/project/${project.id}/tool`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "agent_list_files", args: {} }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: string };
    expect(typeof body.result).toBe("string");
    expect(body.result).toContain("[]");
  });

  it("create_task with dependencies persists the task and its relations", async () => {
    const member = await createTeamMember();
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });

    // Seed an existing task that the new task will depend on. Use the
    // controller so it claims a proper task number (the project's
    // lastTaskNumber counter starts at 0).
    const existing = await createTaskController({
      projectId: project.id,
      currentUserId: member.user.id,
      title: "Existing prerequisite task",
      status: "to-do",
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const response = await app.request(`/api/chat/project/${project.id}/tool`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tool: "create_task",
        args: {
          title: "New dependent task",
          dependencies: [{ targetTaskId: existing.id, relationType: "blocks" }],
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: string };
    const parsed = JSON.parse(body.result) as {
      id: string;
      created: boolean;
      dependencies: number;
    };
    expect(parsed.created).toBe(true);
    expect(parsed.dependencies).toBe(1);

    // The relation must be persisted in the task_relation table.
    const relations = await db
      .select({
        id: schema.taskRelationTable.id,
        sourceTaskId: schema.taskRelationTable.sourceTaskId,
        targetTaskId: schema.taskRelationTable.targetTaskId,
        relationType: schema.taskRelationTable.relationType,
      })
      .from(schema.taskRelationTable)
      .where(eq(schema.taskRelationTable.sourceTaskId, parsed.id));
    expect(relations).toHaveLength(1);
    expect(relations[0].targetTaskId).toBe(existing.id);
    expect(relations[0].relationType).toBe("blocks");
  });
});

// Reuse a single app instance for the message-history permission checks.
const appRequest = (path: string, init?: RequestInit) => {
  const { app } = createApp();
  return app.request(path, init);
};

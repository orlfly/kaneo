import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { publishEvent } from "../../apps/api/src/events";
import { initializePlugins } from "../../apps/api/src/plugins";
import { DEFAULT_PROJECT_COLUMNS } from "../../apps/api/src/project/controllers/create-project";
import { ensureTestDatabaseMigrated } from "./helpers/database";

const SYSTEM_LABELS = [
  { id: 1, name: "priority:low", color: "#0EA5E9" },
  { id: 2, name: "priority:medium", color: "#EAB308" },
  { id: 3, name: "priority:high", color: "#F97316" },
  { id: 4, name: "priority:urgent", color: "#EF4444" },
  { id: 5, name: "status:to-do", color: "#6B7280" },
  { id: 6, name: "status:in-progress", color: "#3B82F6" },
  { id: 7, name: "status:in-review", color: "#8B5CF6" },
  { id: 8, name: "status:done", color: "#10B981" },
];

/** Minimal GitLab v4 HTTP mock used to validate real outbound calls. */
const issueStore = new Map<number, Record<string, unknown>>();
const labelStore = [...SYSTEM_LABELS];
const requests: Array<{ method: string; url: string; body?: unknown }> = [];
let nextIid = 500;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : undefined);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function mockGitLabRoutes(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);

  const match = pathname.match(
    /^\/api\/v4\/projects\/(.+?)(\/issues\/\d+\/notes|\/issues\/\d+|\/issues|\/labels)$/,
  );

  res.setHeader("Content-Type", "application/json");

  void (async () => {
    const body = ["POST", "PUT"].includes(req.method ?? "")
      ? await readBody(req).catch(() => undefined)
      : undefined;
    requests.push({ method: req.method ?? "GET", url: pathname, body });

    if (req.method === "GET" && pathname === "/api/v4/user") {
      return sendJson(res, 200, { id: 1, username: "test-user" });
    }

    if (!match) {
      return sendJson(res, 404, { message: "404 Not Found" });
    }

    const projectPath = match[1];
    const resource = match[2] ?? "";

    const makeIssue = (overrides: Record<string, unknown> = {}) => ({
      id: 1000,
      iid: nextIid,
      project_id: 7,
      title: "Untitled",
      description: null,
      state: "opened",
      web_url: `https://gitlab.mock/${projectPath}/-/issues/${nextIid}`,
      labels: [] as string[],
      updated_at: new Date().toISOString(),
      author: { id: 1, username: "test-user" },
      ...overrides,
    });

    if (req.method === "POST" && resource === "/issues") {
      const payload = (body ?? {}) as {
        title?: string;
        description?: string | null;
        state_event?: string;
      };
      const issue = makeIssue({
        title: payload.title ?? "Untitled",
        description: payload.description ?? null,
        state: payload.state_event === "close" ? "closed" : "opened",
      });
      issueStore.set(issue.iid as number, issue);
      nextIid += 1;
      return sendJson(res, 200, issue);
    }

    const iidMatch = resource.match(/^\/issues\/(\d+)$/);
    if (iidMatch && (req.method === "PUT" || req.method === "GET")) {
      const iid = Number(iidMatch[1]);
      const existing = issueStore.get(iid) ?? makeIssue({ iid });
      if (req.method === "PUT") {
        const payload = (body ?? {}) as {
          title?: string;
          labels?: string;
          state_event?: string;
        };
        if (payload.state_event === "close") existing.state = "closed";
        if (payload.state_event === "reopen") existing.state = "opened";
        if (payload.labels !== undefined) {
          existing.labels = payload.labels.split(",").filter(Boolean);
        }
        if (payload.title !== undefined) existing.title = payload.title;
        existing.updated_at = new Date().toISOString();
        issueStore.set(iid, existing);
      }
      return sendJson(res, 200, existing);
    }

    if (req.method === "GET" && resource.endsWith("/labels")) {
      return sendJson(res, 200, labelStore);
    }

    if (req.method === "POST" && resource.endsWith("/labels")) {
      const payload = (body ?? {}) as { name?: string; color?: string };
      const created = {
        id: labelStore.length + 100,
        name: payload.name ?? "label",
        color: payload.color ?? "#000000",
      };
      labelStore.push(created);
      return sendJson(res, 200, created);
    }

    if (req.method === "POST" && resource.includes("/notes")) {
      return sendJson(res, 200, {
        id: 9001,
        body: (body as { body?: string })?.body,
      });
    }

    return sendJson(res, 404, { message: "Unhandled mock route" });
  })();
}

let server: Server;
let baseUrl = "";
let originalAllowPrivate: string | undefined;

beforeAll(async () => {
  originalAllowPrivate = process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";

  server = createServer(mockGitLabRoutes);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  await ensureTestDatabaseMigrated();
  initializePlugins();
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (originalAllowPrivate === undefined) {
    delete process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;
  } else {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = originalAllowPrivate;
  }
});

beforeEach(async () => {
  // Clear only the tables this test touches. The shared resetTestDatabase
  // helper truncates billing tables that are absent from the local migration
  // set unless cloud billing is enabled.
  await db.delete(schema.activityTable);
  await db.delete(schema.externalLinkTable);
  await db.delete(schema.labelTable);
  await db.delete(schema.taskTable);
  await db.delete(schema.integrationTable);
  await db.delete(schema.columnTable);
  await db.delete(schema.projectTable);
  await db.delete(schema.teamMemberTable);
  await db.delete(schema.teamTable);
  await db.delete(schema.userTable);
  requests.length = 0;
  issueStore.clear();
  labelStore.length = 0;
  labelStore.push(...SYSTEM_LABELS);
  nextIid = 500;
});

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition");
}

const MOCK_PROJECT_PATH = "acme/my-app";
const uid = () => randomUUID();

describe("GitLab outbound event pipeline", () => {
  async function seedContext() {
    const [team] = await db
      .insert(schema.teamTable)
      .values({
        name: "Integration Test Team",
        slug: `team-${uid()}`,
        createdAt: new Date(),
      })
      .returning();
    if (!team) throw new Error("Failed to seed team");

    const [user] = await db
      .insert(schema.userTable)
      .values({
        email: `user-${uid()}@example.com`,
        emailVerified: true,
        name: "Integration Test User",
      })
      .returning();
    if (!user) throw new Error("Failed to seed user");

    await db.insert(schema.teamMemberTable).values({
      teamId: team.id,
      userId: user.id,
      role: "owner",
      joinedAt: new Date(),
    });

    const [project] = await db
      .insert(schema.projectTable)
      .values({
        teamId: team.id,
        slug: `project-${uid()}`,
        name: "Integration Project",
      })
      .returning();
    if (!project) throw new Error("Failed to seed project");

    for (const col of DEFAULT_PROJECT_COLUMNS) {
      await db.insert(schema.columnTable).values({
        projectId: project.id,
        name: col.name,
        slug: col.slug,
        position: col.position,
        isFinal: col.isFinal,
      });
    }

    return { team, user, project };
  }

  async function seedIntegration(projectId: string) {
    const [integration] = await db
      .insert(schema.integrationTable)
      .values({
        projectId,
        type: "gitlab",
        config: JSON.stringify({
          baseUrl,
          accessToken: "glpat-mock",
          repositoryOwner: "acme",
          repositoryName: "my-app",
          webhookSecret: "test-secret",
        }),
        isActive: true,
      })
      .returning();
    if (!integration) throw new Error("Failed to seed integration");
    return integration;
  }

  it("creates a GitLab issue and stores the external link on task.created", async () => {
    const { project } = await seedContext();
    const integration = await seedIntegration(project.id);

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: null,
        title: "Fix outbound sync",
        description: "Detailed description",
        status: "to-do",
        priority: "medium",
        number: 1,
      })
      .returning();
    if (!task) throw new Error("Failed to seed task");

    await publishEvent("task.created", {
      taskId: task.id,
      projectId: project.id,
      userId: task.userId ?? "",
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      number: task.number,
    });

    await waitFor(async () => {
      const posts = requests.filter(
        (r) =>
          r.method === "POST" &&
          r.url.includes("/issues") &&
          !r.url.includes("/notes"),
      );
      return posts.length > 0;
    });

    const issuePost = requests.find(
      (r) => r.method === "POST" && r.url.endsWith("/issues"),
    );
    expect(issuePost?.url).toBe(`/api/v4/projects/${MOCK_PROJECT_PATH}/issues`);
    expect(issuePost?.body).toMatchObject({ title: "Fix outbound sync" });

    await waitFor(async () => {
      const link = await db.query.externalLinkTable.findFirst({
        where: and(
          eq(schema.externalLinkTable.taskId, task.id),
          eq(schema.externalLinkTable.integrationId, integration.id),
        ),
      });
      return link !== undefined;
    });

    const link = await db.query.externalLinkTable.findFirst({
      where: and(
        eq(schema.externalLinkTable.taskId, task.id),
        eq(schema.externalLinkTable.integrationId, integration.id),
      ),
    });
    expect(link?.resourceType).toBe("issue");
    expect(link?.externalId).toBe("500");
    expect(link?.url).toContain("https://gitlab.mock/acme/my-app/-/issues/500");

    // The label merge PUT should carry the task's priority + status labels.
    const labelPut = requests.find(
      (r) =>
        r.method === "PUT" &&
        r.url.endsWith("/issues/500") &&
        typeof (r.body as { labels?: unknown })?.labels === "string",
    );
    expect((labelPut?.body as { labels?: string })?.labels).toBe(
      "priority:medium,status:to-do",
    );
  });

  it("closes the GitLab issue when the task moves to done", async () => {
    const { project } = await seedContext();
    const integration = await seedIntegration(project.id);

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: null,
        title: "Ship it",
        description: null,
        status: "in-progress",
        priority: "medium",
        number: 1,
      })
      .returning();
    if (!task) throw new Error("Failed to seed task");

    // Simulate an already-linked issue (as if created by task.created).
    issueStore.set(501, {
      id: 1001,
      iid: 501,
      title: "Ship it",
      description: null,
      state: "opened",
      web_url: "https://gitlab.mock/acme/my-app/-/issues/501",
      labels: ["priority:medium", "status:in-progress"],
    });
    await db.insert(schema.externalLinkTable).values({
      taskId: task.id,
      integrationId: integration.id,
      resourceType: "issue",
      externalId: "501",
      url: "https://gitlab.mock/acme/my-app/-/issues/501",
      title: "Ship it",
      metadata: JSON.stringify({ state: "opened" }),
    });

    await publishEvent("task.status_changed", {
      taskId: task.id,
      projectId: project.id,
      userId: null,
      oldStatus: "in-progress",
      newStatus: "done",
      title: task.title,
    });

    await waitFor(async () => {
      return requests.some(
        (r) =>
          r.method === "PUT" &&
          r.url.endsWith("/issues/501") &&
          (r.body as { state_event?: string })?.state_event === "close",
      );
    });

    // The final close request must use GitLab's state_event, not state.
    const closePut = requests.find(
      (r) =>
        r.method === "PUT" &&
        r.url.endsWith("/issues/501") &&
        (r.body as { state_event?: string })?.state_event === "close",
    );
    expect(closePut?.body).toMatchObject({ state_event: "close" });

    // The reopened flow: moving out of done must send state_event reopen.
    requests.length = 0;
    await publishEvent("task.status_changed", {
      taskId: task.id,
      projectId: project.id,
      userId: null,
      oldStatus: "done",
      newStatus: "in-progress",
      title: task.title,
    });

    await waitFor(async () => {
      return requests.some(
        (r) =>
          r.method === "PUT" &&
          r.url.endsWith("/issues/501") &&
          (r.body as { state_event?: string })?.state_event === "reopen",
      );
    });
  });
});

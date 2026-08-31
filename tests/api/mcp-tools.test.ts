import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type McpToolRegistrar,
  registerMcpTools,
} from "../../apps/api/src/mcp/tools";

type ToolCallback = (args: unknown) => Promise<{
  content: Array<{ text: string }>;
  isError?: boolean;
}>;

function collectTools() {
  const tools = new Map<string, ToolCallback>();
  const registrar: McpToolRegistrar = {
    registerTool: (name, _config, callback) => tools.set(name, callback),
  };
  registerMcpTools(registrar, "http://api.test", "test-token");
  return tools;
}

const tools = collectTools();

function call(name: string, args: unknown = {}) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool ${name} is not registered`);
  return tool(args);
}

let apiFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  apiFetch = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", apiFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastRequest() {
  const [input, init] = apiFetch.mock.calls.at(-1) as [
    RequestInfo | URL,
    RequestInit | undefined,
  ];
  return {
    url: String(input),
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    auth: new Headers(init?.headers).get("authorization"),
  };
}

describe("MCP tool catalog", () => {
  it("resolves workspace members", async () => {
    await call("list_workspace_members", { teamId: "ws 1" });

    const request = lastRequest();
    expect(request.url).toBe("http://api.test/api/team/ws%201/members");
    expect(request.auth).toBe("Bearer test-token");
  });

  it("passes only the search filters that were supplied", async () => {
    await call("search", { q: "login bug" });
    expect(lastRequest().url).toBe("http://api.test/api/search?q=login+bug");

    await call("search", {
      q: "login bug",
      type: "tasks",
      projectId: "p1",
      limit: 5,
    });
    const url = new URL(lastRequest().url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "login bug",
      type: "tasks",
      projectId: "p1",
      limit: "5",
    });
  });

  it("rejects a search limit above the API maximum", async () => {
    const result = await call("search", { q: "x", limit: 500 });

    expect(result.isError).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("lists the columns whose slugs are valid task statuses", async () => {
    await call("list_project_columns", { projectId: "p1" });

    expect(lastRequest().url).toBe("http://api.test/api/column/p1");
  });

  it("deletes a task", async () => {
    await call("delete_task", { taskId: "t1" });

    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/task/t1",
      method: "DELETE",
    });
  });

  it("assigns and unassigns a task", async () => {
    await call("update_task_assignee", { taskId: "t1", userId: "u1" });
    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/task/assignee/t1",
      method: "PUT",
      body: { userId: "u1" },
    });

    await call("update_task_assignee", { taskId: "t1", userId: null });
    expect(lastRequest().body).toEqual({ userId: null });
  });

  it("rejects an empty assignee id rather than sending it", async () => {
    const result = await call("update_task_assignee", {
      taskId: "t1",
      userId: "",
    });

    expect(result.isError).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("sets and clears a due date", async () => {
    await call("update_task_due_date", {
      taskId: "t1",
      dueDate: "2026-09-01T10:00:00Z",
    });
    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/task/due-date/t1",
      method: "PUT",
      body: { dueDate: "2026-09-01T10:00:00Z" },
    });

    await call("update_task_due_date", { taskId: "t1" });
    expect(lastRequest().body).toEqual({});
  });

  it("rejects a due date that is not an ISO date-time", async () => {
    const result = await call("update_task_due_date", {
      taskId: "t1",
      dueDate: "next tuesday",
    });

    expect(result.isError).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("reads time entries for a task and by id", async () => {
    await call("list_task_time_entries", { taskId: "t1" });
    expect(lastRequest().url).toBe("http://api.test/api/time-entry/task/t1");

    await call("get_time_entry", { id: "te1" });
    expect(lastRequest().url).toBe("http://api.test/api/time-entry/te1");
  });

  it("creates a running time entry when endTime is omitted", async () => {
    await call("create_time_entry", {
      taskId: "t1",
      startTime: "2026-08-10T09:00:00Z",
    });

    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/time-entry",
      method: "POST",
      body: { taskId: "t1", startTime: "2026-08-10T09:00:00Z" },
    });
    expect(lastRequest().body).not.toHaveProperty("endTime");
  });

  it("updates a time entry", async () => {
    await call("update_time_entry", {
      id: "te1",
      startTime: "2026-08-10T09:00:00Z",
      endTime: "2026-08-10T10:30:00Z",
      description: "pairing",
    });

    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/time-entry/te1",
      method: "PUT",
      body: {
        startTime: "2026-08-10T09:00:00Z",
        endTime: "2026-08-10T10:30:00Z",
        description: "pairing",
      },
    });
  });

  it("reads task activity and notifications", async () => {
    await call("list_task_activity", { taskId: "t1" });
    expect(lastRequest().url).toBe("http://api.test/api/activity/t1");

    await call("list_notifications");
    expect(lastRequest().url).toBe("http://api.test/api/notification");
  });

  it("surfaces an API failure as a tool error", async () => {
    apiFetch.mockResolvedValueOnce(
      Response.json({ message: "Task not found" }, { status: 404 }),
    );

    const result = await call("delete_task", { taskId: "missing" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Task not found");
  });

  describe("VCS integration tools", () => {
    it("registers all VCS tools", () => {
      const vcsTools = [
        "vcs_list_repositories",
        "vcs_list_issues",
        "vcs_get_issue",
        "vcs_list_issue_comments",
        "vcs_list_pull_requests",
        "vcs_list_labels",
        "vcs_create_issue",
        "vcs_update_issue",
        "vcs_create_issue_comment",
        "vcs_create_label",
        "vcs_add_labels_to_issue",
        "vcs_replace_issue_labels",
        "vcs_remove_label_from_issue",
        "vcs_import_issues",
      ];
      for (const name of vcsTools) {
        expect(tools.has(name)).toBe(true);
      }
    });

    it("lists repositories for a project's active integration", async () => {
      await call("vcs_list_repositories", {
        type: "gitlab",
        projectId: "p1",
      });
      expect(lastRequest().url).toBe(
        "http://api.test/api/gitlab-integration/vcs/p1/repositories",
      );
    });

    it("lists issues with an optional state filter", async () => {
      await call("vcs_list_issues", { type: "github", projectId: "p1" });
      expect(lastRequest().url).toBe(
        "http://api.test/api/github-integration/vcs/p1/issues",
      );

      await call("vcs_list_issues", {
        type: "gitea",
        projectId: "p1",
        state: "closed",
      });
      expect(lastRequest().url).toBe(
        "http://api.test/api/gitea-integration/vcs/p1/issues?state=closed",
      );
    });

    it("gets a single issue by number", async () => {
      await call("vcs_get_issue", {
        type: "gitlab",
        projectId: "p1",
        number: 42,
      });
      expect(lastRequest().url).toBe(
        "http://api.test/api/gitlab-integration/vcs/p1/issues/42",
      );
    });

    it("lists issue comments", async () => {
      await call("vcs_list_issue_comments", {
        type: "github",
        projectId: "p1",
        number: 7,
      });
      expect(lastRequest().url).toBe(
        "http://api.test/api/github-integration/vcs/p1/issues/7/comments",
      );
    });

    it("lists pull requests and labels", async () => {
      await call("vcs_list_pull_requests", {
        type: "gitea",
        projectId: "p1",
      });
      expect(lastRequest().url).toBe(
        "http://api.test/api/gitea-integration/vcs/p1/pull-requests",
      );

      await call("vcs_list_labels", { type: "gitlab", projectId: "p1" });
      expect(lastRequest().url).toBe(
        "http://api.test/api/gitlab-integration/vcs/p1/labels",
      );
    });

    it("creates an issue", async () => {
      await call("vcs_create_issue", {
        type: "github",
        projectId: "p1",
        title: "Bug",
        body: "Details",
      });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/github-integration/vcs/p1/issues",
        method: "POST",
        body: { title: "Bug", body: "Details" },
      });
    });

    it("updates an issue", async () => {
      await call("vcs_update_issue", {
        type: "gitlab",
        projectId: "p1",
        number: 3,
        state: "closed",
      });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/gitlab-integration/vcs/p1/issues/3",
        method: "PATCH",
        body: { state: "closed" },
      });
    });

    it("creates an issue comment", async () => {
      await call("vcs_create_issue_comment", {
        type: "gitea",
        projectId: "p1",
        number: 5,
        body: "Thanks",
      });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/gitea-integration/vcs/p1/issues/5/comments",
        method: "POST",
        body: { body: "Thanks" },
      });
    });

    it("creates a label", async () => {
      await call("vcs_create_label", {
        type: "github",
        projectId: "p1",
        name: "bug",
        color: "#FF0000",
      });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/github-integration/vcs/p1/labels",
        method: "POST",
        body: { name: "bug", color: "#FF0000" },
      });
    });

    it("adds, replaces, and removes labels on an issue", async () => {
      await call("vcs_add_labels_to_issue", {
        type: "gitlab",
        projectId: "p1",
        number: 1,
        labelIds: [10, 11],
      });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/gitlab-integration/vcs/p1/issues/1/labels",
        method: "POST",
        body: { labelIds: [10, 11] },
      });

      await call("vcs_replace_issue_labels", {
        type: "gitea",
        projectId: "p1",
        number: 2,
        labelIds: [20],
      });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/gitea-integration/vcs/p1/issues/2/labels",
        method: "PUT",
        body: { labelIds: [20] },
      });

      await call("vcs_remove_label_from_issue", {
        type: "github",
        projectId: "p1",
        number: 3,
        labelId: 30,
      });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/github-integration/vcs/p1/issues/3/labels",
        method: "DELETE",
        body: { labelId: 30 },
      });
    });

    it("imports issues into Kaneo tasks", async () => {
      await call("vcs_import_issues", { type: "gitlab", projectId: "p1" });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/gitlab-integration/import-issues",
        method: "POST",
        body: { projectId: "p1" },
      });
    });
  });

  it("registers the create_task_skill prompt", async () => {
    const prompts = new Map<string, unknown>();
    const registrar: McpToolRegistrar = {
      registerTool: (_n, _c, _cb) => {},
      registerPrompt: (name, config, callback) => {
        prompts.set(name, { config, callback });
      },
    };
    registerMcpTools(registrar, "http://api.test", "test-token");

    expect(prompts.has("create_task_skill")).toBe(true);
    const entry = prompts.get("create_task_skill") as {
      config: { title?: string };
      callback: (args: unknown) => Promise<{
        messages: Array<{
          role: string;
          content: { type: string; text: string };
        }>;
      }>;
    };
    expect(entry.config.title).toBe("Create Task Skill");
    const result = await entry.callback({});
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain("Acceptance Criteria");
    expect(result.messages[0].content.text).toContain("requiredRole");
  });

  describe("Agent working-directory tools", () => {
    const agentTools = [
      "agent_clone_repo",
      "agent_list_files",
      "agent_read_file",
      "agent_write_file",
      "agent_search_files",
      "agent_delete_file",
      "agent_run_command",
    ];

    it("registers all agent working-directory tools", () => {
      for (const name of agentTools) {
        expect(tools.has(name)).toBe(true);
      }
    });

    it("routes agent_clone_repo to the tool-execute endpoint", async () => {
      await call("agent_clone_repo", { projectId: "p1" });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/chat/project/p1/tool",
        method: "POST",
        body: { tool: "agent_clone_repo", args: {} },
      });
    });

    it("routes agent_read_file with its paging args", async () => {
      await call("agent_read_file", {
        projectId: "p1",
        path: "src/index.ts",
        offset: 10,
        limit: 20,
      });
      expect(lastRequest()).toMatchObject({
        url: "http://api.test/api/chat/project/p1/tool",
        method: "POST",
        body: {
          tool: "agent_read_file",
          args: { path: "src/index.ts", offset: 10, limit: 20 },
        },
      });
    });

    it("omits optional args for agent_list_files", async () => {
      await call("agent_list_files", { projectId: "p1" });
      expect(lastRequest().body).toEqual({
        tool: "agent_list_files",
        args: {},
      });
    });

    it("rejects an empty required projectId", async () => {
      const result = await call("agent_run_command", {
        projectId: "",
        command: "ls",
      });
      expect(result.isError).toBe(true);
      expect(apiFetch).not.toHaveBeenCalled();
    });
  });

  describe("create_task with dependencies", () => {
    it("creates the task and its declared relations", async () => {
      apiFetch
        .mockResolvedValueOnce(Response.json({ id: "new1" }))
        .mockResolvedValueOnce(Response.json({ id: "rel1" }))
        .mockResolvedValueOnce(Response.json({ id: "rel2" }));

      const result = await call("create_task", {
        projectId: "p1",
        title: "New task",
        description: "## Context\n## Acceptance Criteria\n- done",
        priority: "high",
        status: "to-do",
        dependencies: [
          { targetTaskId: "t1", relationType: "blocks" },
          { targetTaskId: "t2", relationType: "subtask" },
        ],
      });

      expect(result.isError).toBeFalsy();
      // First call: create the task.
      expect(apiFetch.mock.calls[0][1]).toMatchObject({
        method: "POST",
        body: JSON.stringify({
          title: "New task",
          description: "## Context\n## Acceptance Criteria\n- done",
          priority: "high",
          status: "to-do",
        }),
      });
      // Second call: create the first relation.
      expect(apiFetch.mock.calls[1][0]).toBe(
        "http://api.test/api/task-relation",
      );
      expect(JSON.parse(String(apiFetch.mock.calls[1][1]?.body))).toEqual({
        sourceTaskId: "new1",
        targetTaskId: "t1",
        relationType: "blocks",
      });
      // Third call: create the second relation.
      expect(JSON.parse(String(apiFetch.mock.calls[2][1]?.body))).toEqual({
        sourceTaskId: "new1",
        targetTaskId: "t2",
        relationType: "subtask",
      });
    });

    it("rolls back created relations when a dependency fails", async () => {
      apiFetch
        .mockResolvedValueOnce(Response.json({ id: "new1" }))
        .mockResolvedValueOnce(Response.json({ id: "rel1" }))
        .mockResolvedValueOnce(
          Response.json({ message: "Target task not found" }, { status: 404 }),
        )
        .mockResolvedValueOnce(Response.json({ ok: true }));

      const result = await call("create_task", {
        projectId: "p1",
        title: "New task",
        description: "## Context\n## Acceptance Criteria\n- done",
        priority: "high",
        status: "to-do",
        dependencies: [
          { targetTaskId: "t1", relationType: "blocks" },
          { targetTaskId: "missing", relationType: "related" },
        ],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Target task not found");
      // The first relation must be rolled back via DELETE.
      const deleteCall = apiFetch.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/api/task-relation/rel1") &&
          init?.method === "DELETE",
      );
      expect(deleteCall).toBeTruthy();
    });
  });
});

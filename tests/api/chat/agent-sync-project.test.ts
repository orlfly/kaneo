import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  integrationFindFirst: vi.fn(),
  cloneRepo: vi.fn(),
  remoteHead: vi.fn(),
  repoHead: vi.fn(),
  projectContext: vi.fn(),
  workdirRoot: "",
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      integrationTable: { findFirst: mocks.integrationFindFirst },
    },
  },
}));

vi.mock("../../../apps/api/src/chat/config", () => ({
  loadChatConfig: () => Promise.resolve({ workdirRoot: mocks.workdirRoot }),
}));

vi.mock("../../../apps/api/src/agent/git", () => ({
  agentCloneRepo: (...args: unknown[]) => mocks.cloneRepo(...args),
  cloneUrl: () => "https://example.com/owner/repo.git",
  authFor: () => () => ({}),
}));

vi.mock("../../../apps/api/src/agent/context", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../apps/api/src/agent/context")
    >();
  return {
    ...actual,
    remoteHeadSha: (...args: unknown[]) => mocks.remoteHead(...args),
    repoHeadSha: (...args: unknown[]) => mocks.repoHead(...args),
  };
});

vi.mock("../../../apps/api/src/vcs/resolve", () => ({
  resolveVcsIntegration: (_projectId: string, type: string) =>
    Promise.resolve({
      type,
      integrationId: "i1",
      teamId: "t1",
      config: { repositoryOwner: "owner", repositoryName: "repo" },
    }),
}));

vi.mock("../../../apps/api/src/agent/controllers/get-project-context", () => ({
  getProjectContext: (...args: unknown[]) => mocks.projectContext(...args),
}));

const { executeTool } = await import("../../../apps/api/src/chat/tools");

const PROJECT_ID = "p-sync";
let root: string;

const bundle = (connected: boolean) => ({
  project: {
    id: PROJECT_ID,
    name: "Demo",
    slug: "demo",
    description: "",
    teamName: "Team",
  },
  statuses: ["to-do", "done"],
  taskSummary: { total: 2, byStatus: { "to-do": 2 }, overdue: 0 },
  vcs: connected
    ? { connected: true, type: "github", repository: "owner/repo" }
    : { connected: false },
  checkedAt: new Date().toISOString(),
});

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "kaneo-sync-"));
  mocks.workdirRoot = root;
  mocks.integrationFindFirst.mockReset();
  mocks.cloneRepo.mockReset();
  mocks.remoteHead.mockReset();
  mocks.repoHead.mockReset();
  mocks.projectContext.mockReset();
  mocks.projectContext.mockResolvedValue(bundle(true));
  mocks.integrationFindFirst.mockResolvedValue({ id: "i1" });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("agent_sync_project tool", () => {
  it("clones on cold start and writes the context artifacts", async () => {
    mocks.cloneRepo.mockResolvedValue({
      location: "repo",
      branch: "main",
      refreshed: false,
    });
    mocks.repoHead.mockResolvedValue("aaa111");

    const result = JSON.parse(
      await executeTool("agent_sync_project", {}, PROJECT_ID, "u1"),
    );

    expect(result.mode).toBe("cloned");
    expect(result.context.project.id).toBe(PROJECT_ID);
    const manifest = JSON.parse(
      await import("node:fs/promises").then((fs) =>
        fs.readFile(
          path.join(root, `agent-${PROJECT_ID}`, "kaneo-context.json"),
          "utf8",
        ),
      ),
    );
    expect(manifest.headSha).toBe("aaa111");
    expect(manifest.projectId).toBe(PROJECT_ID);
    const doc = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        path.join(root, `agent-${PROJECT_ID}`, "KANEO_CONTEXT.md"),
        "utf8",
      ),
    );
    expect(doc).toContain("# Kaneo Project Context");
    expect(JSON.stringify(result)).not.toContain("accessToken");
  });

  it("reports aligned without pulling when the head matches", async () => {
    const dir = path.join(root, `agent-${PROJECT_ID}`);
    mkdirSync(path.join(dir, "repo", ".git"), { recursive: true });
    writeFileSync(
      path.join(dir, "kaneo-context.json"),
      JSON.stringify({
        projectId: PROJECT_ID,
        projectName: "Demo",
        teamName: "Team",
        vcs: { type: "github", repository: "owner/repo" },
        syncedAt: new Date().toISOString(),
        headSha: "aaa111",
      }),
    );
    mocks.remoteHead.mockResolvedValue("aaa111");

    const result = JSON.parse(
      await executeTool("agent_sync_project", {}, PROJECT_ID, "u1"),
    );

    expect(result.mode).toBe("aligned");
    expect(result.changed).toBe(false);
    expect(mocks.cloneRepo).not.toHaveBeenCalled();
  });

  it("fast-forwards when the remote head differs", async () => {
    const dir = path.join(root, `agent-${PROJECT_ID}`);
    mkdirSync(path.join(dir, "repo", ".git"), { recursive: true });
    writeFileSync(
      path.join(dir, "kaneo-context.json"),
      JSON.stringify({
        projectId: PROJECT_ID,
        projectName: "Demo",
        teamName: "Team",
        vcs: { type: "github", repository: "owner/repo" },
        syncedAt: new Date().toISOString(),
        headSha: "old999",
      }),
    );
    mocks.remoteHead.mockResolvedValue("bbb222");
    mocks.cloneRepo.mockResolvedValue({
      location: "repo",
      branch: "main",
      refreshed: true,
    });
    mocks.repoHead.mockResolvedValue("bbb222");

    const result = JSON.parse(
      await executeTool("agent_sync_project", {}, PROJECT_ID, "u1"),
    );

    expect(result.mode).toBe("aligned");
    expect(result.changed).toBe(true);
    expect(mocks.cloneRepo).toHaveBeenCalled();
  });

  it("returns context-only when no VCS integration is connected", async () => {
    mocks.projectContext.mockResolvedValue(bundle(false));

    const result = JSON.parse(
      await executeTool("agent_sync_project", {}, PROJECT_ID, "u1"),
    );

    expect(result.mode).toBe("context-only");
    expect(result.context.vcs.connected).toBe(false);
    expect(mocks.cloneRepo).not.toHaveBeenCalled();
  });
});

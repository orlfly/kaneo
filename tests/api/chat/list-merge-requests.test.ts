import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  integrationFindFirst: vi.fn(),
  vcsListPullRequests: vi.fn(),
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      integrationTable: { findFirst: mocks.integrationFindFirst },
    },
  },
}));

vi.mock("../../../apps/api/src/vcs/resolve", () => ({
  resolveVcsIntegration: (_projectId: string, type: string) =>
    Promise.resolve({
      type,
      integrationId: `i-${type}`,
      teamId: "t1",
      config: { repositoryOwner: "owner", repositoryName: "repo" },
    }),
}));

vi.mock("../../../apps/api/src/vcs", () => ({
  vcsListPullRequests: (...args: unknown[]) =>
    mocks.vcsListPullRequests(...args),
}));

const { executeTool } = await import("../../../apps/api/src/chat/tools");

const PROJECT_ID = "p1";

beforeEach(() => {
  mocks.integrationFindFirst.mockReset();
  mocks.vcsListPullRequests.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("list_merge_requests tool", () => {
  it("queries only the project's connected VCS integration", async () => {
    mocks.integrationFindFirst
      .mockResolvedValueOnce(undefined) // github
      .mockResolvedValueOnce({ id: "gitlab" }) // gitlab
      .mockResolvedValueOnce(undefined); // gitea
    mocks.vcsListPullRequests.mockResolvedValue([
      { number: 1, title: "Fix bug", state: "opened" },
    ]);

    const result = await executeTool("list_merge_requests", {}, PROJECT_ID);
    const parsed = JSON.parse(result);

    // Only the connected platform is queried, and only that VCS client is used.
    expect(Object.keys(parsed)).toEqual(["gitlab"]);
    expect(mocks.integrationFindFirst).toHaveBeenCalledTimes(3);
    expect(mocks.vcsListPullRequests).toHaveBeenCalledTimes(1);
    expect(mocks.vcsListPullRequests).toHaveBeenCalledWith(
      expect.objectContaining({ type: "gitlab" }),
    );
  });

  it("returns a helpful error when the project has no connected VCS", async () => {
    mocks.integrationFindFirst.mockResolvedValue(undefined);

    const result = await executeTool("list_merge_requests", {}, PROJECT_ID);
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("no connected version-control repository");
    expect(mocks.vcsListPullRequests).not.toHaveBeenCalled();
  });

  it("queries all connected platforms when the project has multiple", async () => {
    mocks.integrationFindFirst
      .mockResolvedValueOnce({ id: "github" }) // github
      .mockResolvedValueOnce({ id: "gitlab" }) // gitlab
      .mockResolvedValueOnce(undefined); // gitea
    mocks.vcsListPullRequests.mockResolvedValue([]);

    const result = await executeTool("list_merge_requests", {}, PROJECT_ID);
    const parsed = JSON.parse(result);

    expect(Object.keys(parsed).sort()).toEqual(["github", "gitlab"]);
    expect(mocks.vcsListPullRequests).toHaveBeenCalledTimes(2);
  });
});

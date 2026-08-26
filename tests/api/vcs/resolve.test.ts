import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  integrationFindFirst: vi.fn(),
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      projectTable: { findFirst: mocks.projectFindFirst },
      integrationTable: { findFirst: mocks.integrationFindFirst },
    },
  },
}));

import { resolveVcsIntegration } from "../../../apps/api/src/vcs/resolve";

beforeEach(() => {
  mocks.projectFindFirst.mockReset();
  mocks.integrationFindFirst.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveVcsIntegration", () => {
  it("throws 404 when the project does not exist", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      resolveVcsIntegration("missing", "gitlab"),
    ).rejects.toMatchObject({ status: 404, message: "Project not found" });
  });

  it("throws 404 when the integration is not found", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "p1", teamId: "t1" });
    mocks.integrationFindFirst.mockResolvedValueOnce(undefined);

    await expect(resolveVcsIntegration("p1", "github")).rejects.toMatchObject({
      status: 404,
      message: "Github integration not found",
    });
  });

  it("throws 400 when the integration is inactive", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "p1", teamId: "t1" });
    mocks.integrationFindFirst.mockResolvedValueOnce({
      id: "i1",
      isActive: false,
      config: "{}",
    });

    await expect(resolveVcsIntegration("p1", "gitea")).rejects.toMatchObject({
      status: 400,
      message: "Gitea integration is not active",
    });
  });

  it("throws 400 when the config is invalid JSON", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "p1", teamId: "t1" });
    mocks.integrationFindFirst.mockResolvedValueOnce({
      id: "i1",
      isActive: true,
      config: "not-json",
    });

    await expect(resolveVcsIntegration("p1", "gitlab")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 400 when the GitHub installation ID is missing", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "p1", teamId: "t1" });
    mocks.integrationFindFirst.mockResolvedValueOnce({
      id: "i1",
      isActive: true,
      config: JSON.stringify({
        repositoryOwner: "owner",
        repositoryName: "repo",
        installationId: null,
      }),
    });

    await expect(resolveVcsIntegration("p1", "github")).rejects.toMatchObject({
      status: 400,
      message: "GitHub installation ID not configured",
    });
  });

  it("resolves a GitHub integration with a non-null installation ID", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "p1", teamId: "t1" });
    mocks.integrationFindFirst.mockResolvedValueOnce({
      id: "i1",
      isActive: true,
      config: JSON.stringify({
        repositoryOwner: "owner",
        repositoryName: "repo",
        installationId: 123,
      }),
    });

    const resolved = await resolveVcsIntegration("p1", "github");
    expect(resolved).toMatchObject({
      type: "github",
      integrationId: "i1",
      teamId: "t1",
      config: { installationId: 123 },
    });
  });

  it("resolves a GitLab integration with token and base URL", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "p1", teamId: "t1" });
    mocks.integrationFindFirst.mockResolvedValueOnce({
      id: "i1",
      isActive: true,
      config: JSON.stringify({
        baseUrl: "https://gitlab.example.com",
        accessToken: "token",
        repositoryOwner: "owner",
        repositoryName: "repo",
      }),
    });

    const resolved = await resolveVcsIntegration("p1", "gitlab");
    expect(resolved).toMatchObject({
      type: "gitlab",
      integrationId: "i1",
      teamId: "t1",
      config: { baseUrl: "https://gitlab.example.com" },
    });
  });

  it("throws 400 when the GitLab config is missing a token", async () => {
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "p1", teamId: "t1" });
    mocks.integrationFindFirst.mockResolvedValueOnce({
      id: "i1",
      isActive: true,
      config: JSON.stringify({
        baseUrl: "https://gitlab.example.com",
        accessToken: "",
        repositoryOwner: "owner",
        repositoryName: "repo",
      }),
    });

    await expect(resolveVcsIntegration("p1", "gitlab")).rejects.toMatchObject({
      status: 400,
      message: "GitLab access token or base URL not configured",
    });
  });
});

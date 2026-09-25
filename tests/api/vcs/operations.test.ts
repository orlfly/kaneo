import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRepoOctokit: vi.fn(),
  createGitLabClient: vi.fn(),
  createGiteaClient: vi.fn(),
}));

vi.mock("../../../apps/api/src/plugins/github/utils/github-app", () => ({
  getRepoOctokit: mocks.getRepoOctokit,
}));

vi.mock("../../../apps/api/src/plugins/gitlab/utils/gitlab-api", () => ({
  createGitLabClient: mocks.createGitLabClient,
}));

vi.mock("../../../apps/api/src/plugins/gitea/utils/gitea-api", () => ({
  createGiteaClient: mocks.createGiteaClient,
}));

import {
  vcsCreateIssue,
  vcsCreateIssueComment,
  vcsListIssues,
  vcsListRepositories,
} from "../../../apps/api/src/vcs/operations";

const githubIntegration = {
  type: "github" as const,
  integrationId: "i1",
  teamId: "t1",
  config: {
    repositoryOwner: "owner",
    repositoryName: "repo",
    installationId: 123,
  },
};

const gitlabIntegration = {
  type: "gitlab" as const,
  integrationId: "i1",
  teamId: "t1",
  config: {
    baseUrl: "https://gitlab.example.com",
    accessToken: "glpat-test",
    repositoryOwner: "owner",
    repositoryName: "repo",
  },
};

const giteaIntegration = {
  type: "gitea" as const,
  integrationId: "i1",
  teamId: "t1",
  config: {
    baseUrl: "https://gitea.example.com",
    accessToken: "gitea-token",
    repositoryOwner: "owner",
    repositoryName: "repo",
  },
};

beforeEach(() => {
  mocks.getRepoOctokit.mockReset();
  mocks.createGitLabClient.mockReset();
  mocks.createGiteaClient.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("vcsListRepositories", () => {
  it("lists GitHub App-accessible repositories", async () => {
    mocks.getRepoOctokit.mockResolvedValue({
      rest: {
        apps: {
          listReposAccessibleToInstallation: vi.fn().mockResolvedValue({
            data: {
              repositories: [
                {
                  id: 1,
                  name: "repo",
                  full_name: "owner/repo",
                  private: false,
                  owner: { login: "owner" },
                  html_url: "https://github.com/owner/repo",
                },
              ],
            },
          }),
        },
      },
    });

    const repos = await vcsListRepositories(githubIntegration);
    expect(repos).toHaveLength(1);
    expect(repos[0]).toMatchObject({ name: "repo", full_name: "owner/repo" });
  });

  it("lists GitLab projects via the client", async () => {
    mocks.createGitLabClient.mockReturnValue({
      listUserRepos: vi.fn().mockResolvedValue([
        {
          id: 1,
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
          private: false,
          html_url: "https://gitlab.example.com/owner/repo",
        },
      ]),
    });

    const repos = await vcsListRepositories(gitlabIntegration);
    expect(repos).toHaveLength(1);
    expect(repos[0]).toMatchObject({ name: "repo" });
  });
});

describe("vcsListIssues", () => {
  it("lists GitHub issues and filters out pull requests", async () => {
    mocks.getRepoOctokit.mockResolvedValue({
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              { number: 1, title: "issue", pull_request: undefined },
              { number: 2, title: "pr", pull_request: { url: "x" } },
            ],
          }),
        },
      },
    });

    const issues = await vcsListIssues(githubIntegration, "open");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ number: 1, title: "issue" });
  });

  it("lists GitLab issues with the state filter", async () => {
    const listIssues = vi.fn().mockResolvedValue([{ iid: 1, title: "issue" }]);
    mocks.createGitLabClient.mockReturnValue({ listIssues });

    const issues = await vcsListIssues(gitlabIntegration, "closed");
    expect(listIssues).toHaveBeenCalledWith("owner", "repo", 1, "closed");
    expect(issues).toHaveLength(1);
  });

  it("lists Gitea issues with the state filter", async () => {
    const listIssues = vi
      .fn()
      .mockResolvedValue([{ number: 1, title: "issue" }]);
    mocks.createGiteaClient.mockReturnValue({ listIssues });

    const issues = await vcsListIssues(giteaIntegration, "all");
    expect(listIssues).toHaveBeenCalledWith("owner", "repo", 1, "all");
    expect(issues).toHaveLength(1);
  });
});

describe("vcsCreateIssue", () => {
  it("creates a GitHub issue", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ data: { number: 1, title: "Bug" } });
    mocks.getRepoOctokit.mockResolvedValue({
      rest: { issues: { create } },
    });

    const issue = await vcsCreateIssue(githubIntegration, {
      title: "Bug",
      body: "Details",
    });
    expect(create).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      title: "Bug",
      body: "Details",
    });
    expect(issue).toMatchObject({ number: 1 });
  });

  it("creates a GitLab issue", async () => {
    const createIssue = vi.fn().mockResolvedValue({ iid: 1, title: "Bug" });
    mocks.createGitLabClient.mockReturnValue({ createIssue });

    const issue = await vcsCreateIssue(gitlabIntegration, {
      title: "Bug",
      body: "Details",
    });
    expect(createIssue).toHaveBeenCalledWith("owner", "repo", {
      title: "Bug",
      body: "Details",
    });
    expect(issue).toMatchObject({ iid: 1 });
  });

  it("creates a Gitea issue", async () => {
    const createIssue = vi.fn().mockResolvedValue({ number: 1, title: "Bug" });
    mocks.createGiteaClient.mockReturnValue({ createIssue });

    const issue = await vcsCreateIssue(giteaIntegration, {
      title: "Bug",
      body: "Details",
    });
    expect(createIssue).toHaveBeenCalledWith("owner", "repo", {
      title: "Bug",
      body: "Details",
    });
    expect(issue).toMatchObject({ number: 1 });
  });
});

describe("vcsCreateIssueComment", () => {
  it("creates a GitHub issue comment", async () => {
    const createComment = vi
      .fn()
      .mockResolvedValue({ data: { id: 1, body: "Thanks" } });
    mocks.getRepoOctokit.mockResolvedValue({
      rest: { issues: { createComment } },
    });

    const comment = await vcsCreateIssueComment(githubIntegration, 5, "Thanks");
    expect(createComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 5,
      body: "Thanks",
    });
    expect(comment).toMatchObject({ id: 1 });
  });

  it("creates a GitLab issue comment", async () => {
    const createIssueComment = vi
      .fn()
      .mockResolvedValue({ id: 1, body: "Thanks" });
    mocks.createGitLabClient.mockReturnValue({ createIssueComment });

    const comment = await vcsCreateIssueComment(gitlabIntegration, 5, "Thanks");
    expect(createIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      5,
      "Thanks",
    );
    expect(comment).toMatchObject({ id: 1 });
  });

  it("creates a Gitea issue comment", async () => {
    const createIssueComment = vi
      .fn()
      .mockResolvedValue({ id: 1, body: "Thanks" });
    mocks.createGiteaClient.mockReturnValue({ createIssueComment });

    const comment = await vcsCreateIssueComment(giteaIntegration, 5, "Thanks");
    expect(createIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      5,
      "Thanks",
    );
    expect(comment).toMatchObject({ id: 1 });
  });
});

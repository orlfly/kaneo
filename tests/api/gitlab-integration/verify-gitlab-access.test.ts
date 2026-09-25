import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGitLabFetch } = vi.hoisted(() => ({
  mockGitLabFetch: vi.fn(),
}));

// Stub GitLabApiError locally; the controller branches on `instanceof` + `.kind`.
type GitLabApiErrorKind =
  | "REDIRECT"
  | "INVALID_JSON"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "EMPTY_RESPONSE";

class GitLabApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: GitLabApiErrorKind,
    public body?: string,
  ) {
    super(message);
    this.name = "GitLabApiError";
  }
}

vi.mock("../../../apps/api/src/plugins/gitlab/utils/gitlab-api", () => ({
  GitLabApiError,
  gitlabFetch: (...args: unknown[]) => mockGitLabFetch(...args),
  createGitLabClient: () => ({
    getRepo: (...args: unknown[]) => mockGitLabFetch(...args),
  }),
  verifyGitLabToken: (...args: unknown[]) => mockGitLabFetch(...args),
  getGitLabTokenInfo: (...args: unknown[]) => mockGitLabFetch(...args),
}));

const { default: verifyGitLabAccess } = await import(
  "../../../apps/api/src/gitlab-integration/controllers/verify-gitlab-access"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyGitLabAccess", () => {
  it("returns success when the token can access the repository", async () => {
    mockGitLabFetch
      .mockResolvedValueOnce({ user: { id: 1, username: "owner" }, scopes: [] })
      .mockResolvedValueOnce({
        name: "repo",
        owner: { login: "group/sub" },
        html_url: "https://gitlab.example/group/sub/repo",
        private: false,
        permissions: { admin: true, push: true, pull: true },
      });

    const result = await verifyGitLabAccess({
      baseUrl: "https://gitlab.example",
      accessToken: "token",
      repositoryOwner: "group/sub",
      repositoryName: "repo",
    });

    expect(result).toMatchObject({
      isInstalled: true,
      hasRequiredPermissions: true,
      repositoryExists: true,
      repositoryPrivate: false,
      missingPermissions: [],
      message: "Token verified as owner.",
      failureReason: null,
    });
  });

  it("returns a redirect-specific message when the URL redirects (e.g. http → https)", async () => {
    mockGitLabFetch.mockRejectedValue(
      new GitLabApiError(
        "GitLab request was redirected (HTTP 308)",
        308,
        "REDIRECT",
      ),
    );

    const result = await verifyGitLabAccess({
      baseUrl: "http://gitlab.example",
      accessToken: "token",
      repositoryOwner: "group/sub",
      repositoryName: "repo",
    });

    expect(result.isInstalled).toBe(false);
    expect(result.repositoryExists).toBe(false);
    expect(result.failureReason).toBe("redirected");
    expect(result.message).toContain("redirected");
    expect(result.message).toContain("HTTP 308");
    expect(result.message).not.toContain(
      "does not point to a GitLab instance.",
    );
  });

  it("returns a redirect-specific message when getRepo redirects after the token check succeeds", async () => {
    mockGitLabFetch
      .mockResolvedValueOnce({ user: { id: 1, username: "owner" }, scopes: [] })
      .mockRejectedValueOnce(
        new GitLabApiError(
          "GitLab request was redirected (HTTP 301)",
          301,
          "REDIRECT",
        ),
      );

    const result = await verifyGitLabAccess({
      baseUrl: "http://gitlab.example",
      accessToken: "token",
      repositoryOwner: "group/sub",
      repositoryName: "repo",
    });

    expect(result.isInstalled).toBe(false);
    expect(result.failureReason).toBe("redirected");
    expect(result.message).toContain("HTTP 301");
  });

  it("returns 'not a GitLab instance' when the response is invalid JSON", async () => {
    mockGitLabFetch.mockRejectedValue(
      new GitLabApiError(
        "GitLab API returned invalid JSON",
        200,
        "INVALID_JSON",
      ),
    );

    const result = await verifyGitLabAccess({
      baseUrl: "https://not-gitlab.example",
      accessToken: "token",
      repositoryOwner: "group/sub",
      repositoryName: "repo",
    });

    expect(result.isInstalled).toBe(false);
    expect(result.failureReason).toBe("not_a_gitlab_instance");
    expect(result.message).toBe("The URL does not point to a GitLab instance.");
  });

  it("does not branch on the message string — INVALID_JSON must use the kind discriminator", async () => {
    // Same status and message as the redirect case, but with INVALID_JSON kind.
    // The controller must dispatch on kind, not message substring matching.
    mockGitLabFetch.mockRejectedValue(
      new GitLabApiError("GitLab request was redirected", 308, "INVALID_JSON"),
    );

    const result = await verifyGitLabAccess({
      baseUrl: "http://gitlab.example",
      accessToken: "token",
      repositoryOwner: "group/sub",
      repositoryName: "repo",
    });

    expect(result.failureReason).toBe("not_a_gitlab_instance");
    expect(result.message).toBe("The URL does not point to a GitLab instance.");
  });
});

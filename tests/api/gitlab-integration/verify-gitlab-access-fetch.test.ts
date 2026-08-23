import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { default: verifyGitLabAccess } = await import(
  "../../../apps/api/src/gitlab-integration/controllers/verify-gitlab-access"
);

// ponytail: capture the env var so we don't leak the SSRF bypass across tests.
const originalAllowPrivate =
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;

function makeResponse(status: number, body: string | object = ""): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  // Bypass the SSRF DNS check so the test does not depend on outbound DNS
  // resolving gitlab.example. Without this, the real lookup would fail in CI.
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";
});

afterEach(() => {
  if (originalAllowPrivate === undefined) {
    delete process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;
  } else {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = originalAllowPrivate;
  }
  vi.unstubAllGlobals();
});

describe("verifyGitLabAccess — fetch integration", () => {
  it("returns success when the API returns a user and a writable project", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { id: 1, username: "owner" }))
      .mockResolvedValueOnce(
        // Raw GitLab v4 project payload (what the real API returns).
        makeResponse(200, {
          id: 7,
          name: "repo",
          path_with_namespace: "group/sub/repo",
          web_url: "https://gitlab.example/group/sub/repo",
          visibility: "public",
          namespace: { full_path: "group/sub" },
          permissions: {
            project_access: { access_level: 40 },
            group_access: null,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await verifyGitLabAccess({
      baseUrl: "https://gitlab.example",
      accessToken: "token",
      repositoryOwner: "group/sub",
      repositoryName: "repo",
    });

    expect(result).toEqual({
      isInstalled: true,
      hasRequiredPermissions: true,
      repositoryExists: true,
      repositoryPrivate: false,
      missingPermissions: [],
      message: "Token can access the repository.",
      failureReason: null,
    });
  });

  it("returns the 'not a GitLab instance' message when the response body is HTML, not JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(200, "<html>Not GitLab</html>"));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await verifyGitLabAccess({
      baseUrl: "https://gitlab.example",
      accessToken: "token",
      repositoryOwner: "group/sub",
      repositoryName: "repo",
    });

    expect(result.isInstalled).toBe(false);
    expect(result.failureReason).toBe("not_a_gitlab_instance");
    expect(result.message).toBe("The URL does not point to a GitLab instance.");
  });

  it("reports missing permissions for a read-only Reporter-level token", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { id: 1, username: "owner" }))
      .mockResolvedValueOnce(
        makeResponse(200, {
          id: 7,
          name: "repo",
          path_with_namespace: "group/repo",
          web_url: "https://gitlab.example/group/repo",
          visibility: "private",
          namespace: { full_path: "group" },
          permissions: {
            project_access: { access_level: 20 },
            group_access: null,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await verifyGitLabAccess({
      baseUrl: "https://gitlab.example",
      accessToken: "token",
      repositoryOwner: "group",
      repositoryName: "repo",
    });

    expect(result.isInstalled).toBe(true);
    expect(result.hasRequiredPermissions).toBe(false);
    expect(result.repositoryPrivate).toBe(true);
    expect(result.missingPermissions).toContain("issues (write)");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ repo: vi.fn(), client: vi.fn() }));
vi.mock("../../../apps/api/node_modules/octokit", () => ({
  App: class {
    getInstallationOctokit = m.client;
  },
}));
const { getVerifiedInstallationOctokit } = await import(
  "../../../apps/api/src/plugins/github/utils/github-app"
);
const binding = {
  repositoryOwner: "owner",
  repositoryName: "repo",
  installationId: 10,
  repositoryId: 20,
  verifiedGithubAccountId: "30",
  verifiedByUserId: "user",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_APP_ID", "1");
  vi.stubEnv(
    "GITHUB_PRIVATE_KEY",
    "-----BEGIN RSA PRIVATE KEY-----\nunit-test-key\n-----END RSA PRIVATE KEY-----",
  );
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", "unit-test-secret");
  m.client.mockResolvedValue({ rest: { repos: { get: m.repo } } });
});
afterEach(() => vi.unstubAllEnvs());

describe("getGithubApp configuration gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GITHUB_APP_ID", "1");
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "unit-test-secret");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("treats a truncated (non-PEM) private key as unconfigured", async () => {
    // dotenv serves only the first line of an unquoted multi-line PEM; the
    // gate must not pass a fragment to the App constructor, where it would
    // surface later as an opaque JWT signing failure.
    vi.stubEnv("GITHUB_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----");
    const { getGithubApp } = await import(
      "../../../apps/api/src/plugins/github/utils/github-app"
    );
    expect(getGithubApp()).toBeNull();
  });

  it("accepts a complete PKCS#1 PEM", async () => {
    vi.stubEnv(
      "GITHUB_PRIVATE_KEY",
      "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
    );
    const { getGithubApp } = await import(
      "../../../apps/api/src/plugins/github/utils/github-app"
    );
    expect(getGithubApp()).not.toBeNull();
  });
});

describe("GitHub outgoing repository binding", () => {
  it("permits only the verified numeric repository", async () => {
    m.repo.mockResolvedValue({ data: { id: 20 } });
    await expect(
      getVerifiedInstallationOctokit(binding),
    ).resolves.toHaveProperty("rest");
    expect(m.client).toHaveBeenCalledWith(10);
  });
  it("rejects a name reused for a different repository", async () => {
    m.repo.mockResolvedValue({ data: { id: 21 } });
    await expect(getVerifiedInstallationOctokit(binding)).rejects.toThrow(
      "identity changed",
    );
  });
  it("rejects a legacy binding without contacting GitHub", async () => {
    await expect(
      getVerifiedInstallationOctokit({
        repositoryOwner: "owner",
        repositoryName: "repo",
        installationId: 10,
      }),
    ).rejects.toThrow("requires verification");
    expect(m.client).not.toHaveBeenCalled();
  });
  it("fails closed when the verified installation loses repository access", async () => {
    m.repo.mockRejectedValue(
      Object.assign(new Error("not found"), { status: 404 }),
    );
    await expect(getVerifiedInstallationOctokit(binding)).rejects.toMatchObject(
      { status: 404 },
    );
  });
});

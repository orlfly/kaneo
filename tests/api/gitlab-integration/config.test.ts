import { describe, expect, it } from "vitest";
import {
  getDefaultGitLabConfig,
  normalizeGitLabBaseUrl,
  validateGitLabConfig,
} from "../../../apps/api/src/plugins/gitlab/config";

describe("normalizeGitLabBaseUrl", () => {
  it("strips trailing slashes and keeps the protocol-relative path", () => {
    expect(normalizeGitLabBaseUrl("https://gitlab.example.com///")).toBe(
      "https://gitlab.example.com",
    );
    expect(normalizeGitLabBaseUrl("https://gitlab.example.com/gitlab")).toBe(
      "https://gitlab.example.com/gitlab",
    );
  });

  it("rejects credentials, query, and fragments", () => {
    expect(() =>
      normalizeGitLabBaseUrl("https://user:pass@gitlab.example.com"),
    ).toThrow(/must not contain/);
    expect(() =>
      normalizeGitLabBaseUrl("https://gitlab.example.com?x=1"),
    ).toThrow(/must not contain/);
    expect(() =>
      normalizeGitLabBaseUrl("https://gitlab.example.com#frag"),
    ).toThrow(/must not contain/);
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => normalizeGitLabBaseUrl("ftp://gitlab.example.com")).toThrow(
      /must use http or https/,
    );
  });
});

describe("validateGitLabConfig", () => {
  it("accepts a complete GitLab config", async () => {
    const result = await validateGitLabConfig({
      baseUrl: "https://gitlab.example.com",
      accessToken: "glpat-abc",
      repositoryOwner: "acme",
      repositoryName: "my-app",
      webhookSecret: "secret",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a missing access token", async () => {
    const result = await validateGitLabConfig({
      baseUrl: "https://gitlab.example.com",
      accessToken: "",
      repositoryOwner: "acme",
      repositoryName: "my-app",
    });
    expect(result.valid).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it("rejects an invalid base URL", async () => {
    const result = await validateGitLabConfig({
      baseUrl: "not-a-url",
      accessToken: "glpat-abc",
      repositoryOwner: "acme",
      repositoryName: "my-app",
    });
    expect(result.valid).toBe(false);
  });
});

describe("getDefaultGitLabConfig", () => {
  it("normalizes the base URL and applies defaults", () => {
    const config = getDefaultGitLabConfig(
      "https://gitlab.example.com/",
      "glpat-abc",
      "acme",
      "my-app",
      "secret",
    );
    expect(config.baseUrl).toBe("https://gitlab.example.com");
    expect(config.branchPattern).toBe("{slug}-{number}");
    expect(config.commentTaskLinkOnGitLabIssue).toBe(true);
    expect(config.statusTransitions).toEqual({
      onBranchPush: "in-progress",
      onPROpen: "in-review",
      onPRMerge: "done",
    });
  });
});

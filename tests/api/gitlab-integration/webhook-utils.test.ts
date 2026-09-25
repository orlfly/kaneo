import { describe, expect, it } from "vitest";
import {
  verifyGitLabTokenHeader,
  verifyGitLabWebhook,
} from "../../../apps/api/src/plugins/gitlab/utils/verify-signature";
import {
  baseUrlFromProject,
  splitProjectPath,
} from "../../../apps/api/src/plugins/gitlab/utils/webhook-repo";

describe("webhook-repo", () => {
  it("derives the instance base URL from a GitLab webhook project", () => {
    expect(
      baseUrlFromProject({
        web_url: "https://gitlab.example/group/sub/repo",
        path_with_namespace: "group/sub/repo",
      }),
    ).toBe("https://gitlab.example");
  });

  it("returns empty when the payload does not match a project path", () => {
    expect(
      baseUrlFromProject({
        web_url: "https://gitlab.example/other",
        path_with_namespace: "group/sub/repo",
      }),
    ).toBe("");
    expect(baseUrlFromProject({ web_url: "", path_with_namespace: "" })).toBe(
      "",
    );
  });

  it("splits nested namespaces at the last slash", () => {
    expect(splitProjectPath("group/sub/repo")).toEqual({
      owner: "group/sub",
      name: "repo",
    });
    expect(splitProjectPath("owner/repo")).toEqual({
      owner: "owner",
      name: "repo",
    });
  });
});

describe("verify-signature", () => {
  it("accepts the matching GitLab token header", () => {
    expect(
      verifyGitLabWebhook("unused-payload", "hunter2-secret", "hunter2-secret"),
    ).toBe(true);
  });

  it("rejects a mismatched token header", () => {
    expect(verifyGitLabTokenHeader("p", "hunter2-secret", "wrong-token")).toBe(
      false,
    );
  });

  it("rejects missing token or header", () => {
    expect(verifyGitLabTokenHeader("p", "", undefined)).toBe(false);
    expect(verifyGitLabTokenHeader("p", "secret", undefined)).toBe(false);
  });
});

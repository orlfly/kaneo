import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "../api-integration/helpers/auth";
import { resetTestDatabase } from "../api-integration/helpers/database";
import {
  createProjectFixture,
  createTeamMember,
} from "../api-integration/helpers/fixtures";

vi.mock("../../apps/api/src/plugins/github/utils/github-app", () => ({
  // No App configured on this instance: getGithubApp() returns null.
  getGithubApp: () => null,
}));

describe("POST /api/github-integration/verify when the GitHub App is not configured", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    vi.clearAllMocks();
  });

  it("returns the structured guidance (200) instead of 403/503, even without a linked github account", async () => {
    const member = await createTeamMember({ role: "owner" });
    const { project } = await createProjectFixture({
      teamId: member.team.id,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/github-integration/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        repositoryOwner: "owner",
        repositoryName: "repo",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      isInstalled: boolean;
      repositoryExists: boolean | null;
      message: string;
    };
    expect(body.isInstalled).toBe(false);
    expect(body.repositoryExists).toBeNull();
    expect(body.message).toContain("GITHUB_APP_ID");
    expect(body.message).toContain("GITHUB_PRIVATE_KEY");
    expect(body.message).toContain("GITHUB_WEBHOOK_SECRET");
  });
});

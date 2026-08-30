import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { Octokit } from "octokit";
import db from "../../database";
import { integrationTable, projectTable } from "../../database/schema";
import {
  defaultGitHubConfig,
  type GitHubConfig,
} from "../../plugins/github/config";
import { getGithubApp } from "../../plugins/github/utils/github-app";

async function createGithubIntegration({
  projectId,
  repositoryOwner,
  repositoryName,
  accessToken,
}: {
  projectId: string;
  repositoryOwner: string;
  repositoryName: string;
  accessToken?: string;
}) {
  const existingIntegration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.projectId, projectId),
      eq(integrationTable.type, "github"),
    ),
  });

  // When the request omits a token but this project already stores one (e.g.
  // the UI never echoes secrets back), keep using the stored credential.
  let storedToken: string | undefined;
  if (existingIntegration) {
    try {
      storedToken = (JSON.parse(existingIntegration.config) as GitHubConfig)
        .accessToken;
    } catch {
      // corrupt config, fall through without a stored token
    }
  }
  const token = accessToken?.trim() || storedToken || undefined;

  const githubApp = getGithubApp();

  if (!githubApp && !token) {
    throw new HTTPException(500, {
      message:
        "GitHub integration is not configured. Add a personal access token or configure a GitHub App.",
    });
  }

  if (token) {
    // Validate the token can actually write issues in the target repo before
    // persisting the integration, so a mistyped or revoked token fails fast.
    const octokit = new Octokit({ auth: token });
    try {
      const response = await octokit.rest.repos.get({
        owner: repositoryOwner,
        repo: repositoryName,
      });
      const writable =
        response.data.permissions?.push === true ||
        response.data.permissions?.admin === true;
      if (!writable) {
        throw new HTTPException(403, {
          message: "The GitHub token cannot write to this repository",
        });
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      const status = (error as { status?: number })?.status;
      if (status === 404) {
        throw new HTTPException(404, {
          message:
            "Repository not found or not accessible with the provided token",
        });
      }
      if (status === 401 || status === 403) {
        throw new HTTPException(401, {
          message: "Invalid or unauthorized GitHub token",
        });
      }
      throw new HTTPException(500, {
        message: `Failed to verify GitHub repository: ${(error as Error).message || "Unknown error"}`,
      });
    }
  }

  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const allGitHubIntegrations = await db.query.integrationTable.findMany({
    where: eq(integrationTable.type, "github"),
  });

  for (const integration of allGitHubIntegrations) {
    if (integration.projectId === projectId) {
      continue;
    }

    try {
      const config = JSON.parse(integration.config);
      if (
        config.repositoryOwner === repositoryOwner &&
        config.repositoryName === repositoryName
      ) {
        throw new HTTPException(409, {
          message: `Repository ${repositoryOwner}/${repositoryName} is already linked to another project`,
        });
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
    }
  }

  let installationId: number | null = null;
  if (githubApp && !token) {
    try {
      const { data: installation } =
        await githubApp.octokit.rest.apps.getRepoInstallation({
          owner: repositoryOwner,
          repo: repositoryName,
        });
      installationId = installation.id;
    } catch (error) {
      console.warn("Could not get installation ID for repository:", error);
    }
  }

  const config = {
    repositoryOwner,
    repositoryName,
    installationId,
    ...(token ? { accessToken: token } : {}),
    ...defaultGitHubConfig,
  };

  if (existingIntegration) {
    const [updatedIntegration] = await db
      .update(integrationTable)
      .set({
        config: JSON.stringify(config),
        isActive: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationTable.projectId, projectId),
          eq(integrationTable.type, "github"),
        ),
      )
      .returning();

    return {
      id: updatedIntegration?.id,
      projectId: updatedIntegration?.projectId,
      repositoryOwner,
      repositoryName,
      installationId,
      isActive: updatedIntegration?.isActive,
      createdAt: updatedIntegration?.createdAt,
      updatedAt: updatedIntegration?.updatedAt,
    };
  }

  const [newIntegration] = await db
    .insert(integrationTable)
    .values({
      projectId,
      type: "github",
      config: JSON.stringify(config),
      isActive: true,
    })
    .returning();

  return {
    id: newIntegration?.id,
    projectId: newIntegration?.projectId,
    repositoryOwner,
    repositoryName,
    installationId,
    isActive: newIntegration?.isActive,
    createdAt: newIntegration?.createdAt,
    updatedAt: newIntegration?.updatedAt,
  };
}

export default createGithubIntegration;

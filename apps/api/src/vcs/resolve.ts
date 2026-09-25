import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { integrationTable, projectTable } from "../database/schema";
import type { GiteaConfig } from "../plugins/gitea/config";
import type { GitHubConfig } from "../plugins/github/config";
import type { GitLabConfig } from "../plugins/gitlab/config";

export type VcsType = "github" | "gitlab" | "gitea";

export type ResolvedVcsIntegration =
  | {
      type: "github";
      integrationId: string;
      teamId: string;
      config: GitHubConfig & { installationId?: number };
    }
  | {
      type: "gitlab";
      integrationId: string;
      teamId: string;
      config: GitLabConfig;
    }
  | {
      type: "gitea";
      integrationId: string;
      teamId: string;
      config: GiteaConfig;
    };

/**
 * Resolve the active integration of the given type for a project and parse its
 * stored config. Throws an HTTPException when the project or integration is
 * missing or inactive, or when the config is invalid.
 */
export async function resolveVcsIntegration(
  projectId: string,
  type: VcsType,
): Promise<ResolvedVcsIntegration> {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const integration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.projectId, projectId),
      eq(integrationTable.type, type),
    ),
  });

  if (!integration) {
    throw new HTTPException(404, {
      message: `${capitalize(type)} integration not found`,
    });
  }

  if (!integration.isActive) {
    throw new HTTPException(400, {
      message: `${capitalize(type)} integration is not active`,
    });
  }

  let config: unknown;
  try {
    config = JSON.parse(integration.config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HTTPException(400, {
      message: `Invalid ${type} integration config: ${message}`,
    });
  }

  if (type === "github") {
    const githubConfig = config as GitHubConfig;
    if (!githubConfig.installationId && !githubConfig.accessToken) {
      throw new HTTPException(400, {
        message: "GitHub installation or access token not configured",
      });
    }
    return {
      type,
      integrationId: integration.id,
      teamId: project.teamId,
      config: githubConfig as GitHubConfig & { installationId?: number },
    };
  }

  if (type === "gitlab") {
    const gitlabConfig = config as GitLabConfig;
    if (!gitlabConfig.accessToken || !gitlabConfig.baseUrl) {
      throw new HTTPException(400, {
        message: "GitLab access token or base URL not configured",
      });
    }
    return {
      type,
      integrationId: integration.id,
      teamId: project.teamId,
      config: gitlabConfig,
    };
  }

  const giteaConfig = config as GiteaConfig;
  if (!giteaConfig.accessToken || !giteaConfig.baseUrl) {
    throw new HTTPException(400, {
      message: "Gitea access token or base URL not configured",
    });
  }
  return {
    type,
    integrationId: integration.id,
    teamId: project.teamId,
    config: giteaConfig,
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

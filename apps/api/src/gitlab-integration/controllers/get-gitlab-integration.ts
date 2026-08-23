import { and, eq } from "drizzle-orm";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import {
  defaultGitLabConfig,
  type GitLabConfig,
} from "../../plugins/gitlab/config";
import { normalizeApiServerUrl } from "../../utils/openapi-spec";

function maskToken(token: string): string {
  if (token.length <= 8) {
    return "••••••••";
  }
  return `${token.slice(0, 4)}••••••${token.slice(-4)}`;
}

async function getGitLabIntegration(
  projectId: string,
  includeWebhookSecret = false,
) {
  const integration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.projectId, projectId),
      eq(integrationTable.type, "gitlab"),
    ),
  });

  if (!integration) {
    return null;
  }

  const config = JSON.parse(integration.config) as GitLabConfig;

  const apiBase = normalizeApiServerUrl(
    process.env.KANEO_API_URL || "http://localhost:1337",
  );

  return {
    id: integration.id,
    projectId: integration.projectId,
    baseUrl: config.baseUrl,
    repositoryOwner: config.repositoryOwner,
    repositoryName: config.repositoryName,
    maskedAccessToken: maskToken(config.accessToken),
    webhookUrl: `${apiBase.replace(/\/$/, "")}/gitlab-integration/webhook/${integration.id}`,
    webhookSecret: includeWebhookSecret ? (config.webhookSecret ?? "") : "",
    branchPattern: config.branchPattern || defaultGitLabConfig.branchPattern,
    commentTaskLinkOnGitLabIssue: config.commentTaskLinkOnGitLabIssue !== false,
    isActive: integration.isActive,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

export default getGitLabIntegration;

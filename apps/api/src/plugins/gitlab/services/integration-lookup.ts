import { and, eq } from "drizzle-orm";
import db from "../../../database";
import { integrationTable } from "../../../database/schema";
import type { GitLabConfig } from "../config";
import { normalizeGitLabBaseUrl } from "../config";

export async function findAllIntegrationsByGitLabRepo(
  baseUrl: string,
  owner: string,
  repo: string,
  integrationId?: string,
) {
  const normalized = normalizeGitLabBaseUrl(baseUrl);
  const conditions = [
    eq(integrationTable.type, "gitlab"),
    eq(integrationTable.isActive, true),
  ];
  if (integrationId) {
    conditions.push(eq(integrationTable.id, integrationId));
  }

  const integrations = await db.query.integrationTable.findMany({
    where: and(...conditions),
    with: {
      project: true,
    },
  });

  return integrations.filter((integration) => {
    try {
      const config = JSON.parse(integration.config) as GitLabConfig;
      const matches =
        normalizeGitLabBaseUrl(config.baseUrl) === normalized &&
        config.repositoryOwner === owner &&
        config.repositoryName === repo;
      if (integrationId && !matches) {
        console.warn(
          "[GitLab Webhook] Signed integration repository mismatch",
          {
            integrationId,
          },
        );
      }
      return matches;
    } catch {
      return false;
    }
  });
}

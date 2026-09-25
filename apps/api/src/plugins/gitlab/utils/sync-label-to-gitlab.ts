import { eq } from "drizzle-orm";
import db from "../../../database";
import { externalLinkTable } from "../../../database/schema";
import type { GitLabConfig } from "../config";
import { createGitLabClient } from "./gitlab-api";

const namedColorToHex: Record<string, string> = {
  red: "EF4444",
  orange: "F97316",
  amber: "F59E0B",
  yellow: "EAB308",
  lime: "84CC16",
  green: "22C55E",
  emerald: "10B981",
  teal: "14B8A6",
  cyan: "06B6D4",
  sky: "0EA5E9",
  blue: "3B82F6",
  indigo: "6366F1",
  violet: "8B5CF6",
  purple: "A855F7",
  fuchsia: "D946EF",
  pink: "EC4899",
  rose: "F43F5E",
  gray: "6B7280",
  slate: "64748B",
  zinc: "71717A",
  neutral: "737373",
  stone: "78716C",
};

function toHexColor(color: string): string {
  const lower = color.toLowerCase().replace(/^#/, "");
  if (namedColorToHex[lower]) {
    return namedColorToHex[lower];
  }
  if (/^[0-9a-f]{6}$/i.test(lower)) {
    return lower;
  }
  if (/^[0-9a-f]{3}$/i.test(lower)) {
    const [r, g, b] = lower.split("");
    return `${r}${r}${g}${g}${b}${b}`;
  }
  return "6B7280";
}

async function getGitLabIssueContext(taskId: string) {
  const externalLinks = await db.query.externalLinkTable.findMany({
    where: eq(externalLinkTable.taskId, taskId),
    with: {
      integration: true,
    },
  });

  const externalLink = externalLinks.find(
    (link) =>
      link.resourceType === "issue" && link.integration?.type === "gitlab",
  );

  if (!externalLink) {
    return null;
  }

  const integration = externalLink.integration;
  if (!integration) {
    return null;
  }

  let config: GitLabConfig;
  try {
    config = JSON.parse(integration.config) as GitLabConfig;
  } catch {
    return null;
  }

  if (!config.accessToken || !config.baseUrl) {
    return null;
  }

  const client = createGitLabClient(config);
  const issueNumber = Number.parseInt(externalLink.externalId, 10);
  if (Number.isNaN(issueNumber)) {
    console.warn("Invalid GitLab issue externalId for label sync", {
      externalLinkId: externalLink.id,
      externalId: externalLink.externalId,
      taskId,
    });
    return null;
  }

  return {
    client,
    config,
    issueNumber,
  };
}

export async function syncLabelToGitLab(
  taskId: string,
  labelName: string,
  labelColor: string,
) {
  const ctx = await getGitLabIssueContext(taskId);
  if (!ctx) return;

  const { client, config, issueNumber } = ctx;
  const color = toHexColor(labelColor);

  const labels = await client.listLabels(
    config.repositoryOwner,
    config.repositoryName,
  );
  let label = labels.find((l) => l.name === labelName);

  if (!label) {
    try {
      label = await client.createLabel(
        config.repositoryOwner,
        config.repositoryName,
        labelName,
        color,
      );
    } catch (error) {
      console.error(`Failed to create label "${labelName}" in GitLab:`, error);
      return;
    }
  }

  try {
    const issue = await client.getIssue(
      config.repositoryOwner,
      config.repositoryName,
      issueNumber,
    );
    const existingNames = (issue.labels ?? []).map((l) => l.name);
    if (existingNames.includes(label.name)) {
      return;
    }
    await client.addLabelsToIssue(
      config.repositoryOwner,
      config.repositoryName,
      issueNumber,
      [label.id],
    );
  } catch (error) {
    console.error(`Failed to add label "${labelName}" to GitLab issue:`, error);
  }
}

export async function removeLabelFromGitLab(taskId: string, labelName: string) {
  const ctx = await getGitLabIssueContext(taskId);
  if (!ctx) return;

  const { client, config, issueNumber } = ctx;

  const labels = await client.listLabels(
    config.repositoryOwner,
    config.repositoryName,
  );
  const label = labels.find((l) => l.name === labelName);
  if (!label) return;

  try {
    await client.removeLabelFromIssue(
      config.repositoryOwner,
      config.repositoryName,
      issueNumber,
      label.id,
    );
  } catch (error) {
    console.error(
      `Failed to remove label "${labelName}" from GitLab issue:`,
      error,
    );
  }
}

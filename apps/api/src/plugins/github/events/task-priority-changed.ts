import type { PluginContext, TaskPriorityChangedEvent } from "../../types";
import type { GitHubConfig } from "../config";
import { findExternalLinksByTask } from "../services/link-manager";
import { getRepoOctokit } from "../utils/github-app";
import { addLabelsToIssue, removeLabel } from "../utils/labels";

export async function handleTaskPriorityChanged(
  event: TaskPriorityChangedEvent,
  context: PluginContext,
): Promise<void> {
  const config = context.config as GitHubConfig;
  const { repositoryOwner, repositoryName } = config;

  const octokit = await getRepoOctokit(config);
  if (!octokit) {
    return;
  }

  try {
    const links = await findExternalLinksByTask(event.taskId);
    const issueLink = links.find(
      (link) =>
        link.integrationId === context.integrationId &&
        link.resourceType === "issue",
    );

    if (!issueLink) {
      return;
    }

    const issueNumber = Number.parseInt(issueLink.externalId, 10);

    if (event.oldPriority && event.oldPriority !== "no-priority") {
      await removeLabel(
        octokit,
        repositoryOwner,
        repositoryName,
        issueNumber,
        `priority:${event.oldPriority}`,
      );
    }

    if (event.newPriority && event.newPriority !== "no-priority") {
      await addLabelsToIssue(
        octokit,
        repositoryOwner,
        repositoryName,
        issueNumber,
        [`priority:${event.newPriority}`],
      );
    }
  } catch (error) {
    console.error("Failed to update GitHub issue priority:", error);
  }
}

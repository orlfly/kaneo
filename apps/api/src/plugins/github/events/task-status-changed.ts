import type { PluginContext, TaskStatusChangedEvent } from "../../types";
import type { GitHubConfig } from "../config";
import {
  findExternalLinksByTask,
  updateExternalLink,
} from "../services/link-manager";
import { getRepoOctokit } from "../utils/github-app";
import { addLabelsToIssue, removeLabel } from "../utils/labels";

export async function handleTaskStatusChanged(
  event: TaskStatusChangedEvent,
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

    await removeLabel(
      octokit,
      repositoryOwner,
      repositoryName,
      issueNumber,
      `status:${event.oldStatus}`,
    );

    await addLabelsToIssue(
      octokit,
      repositoryOwner,
      repositoryName,
      issueNumber,
      [`status:${event.newStatus}`],
    );

    if (event.newStatus === "done") {
      await octokit.rest.issues.update({
        owner: repositoryOwner,
        repo: repositoryName,
        issue_number: issueNumber,
        state: "closed",
      });

      await updateExternalLink(issueLink.id, {
        metadata: {
          ...(issueLink.metadata ? JSON.parse(issueLink.metadata) : {}),
          state: "closed",
        },
      });
    } else if (event.oldStatus === "done" && event.newStatus !== "done") {
      await octokit.rest.issues.update({
        owner: repositoryOwner,
        repo: repositoryName,
        issue_number: issueNumber,
        state: "open",
      });

      await updateExternalLink(issueLink.id, {
        metadata: {
          ...(issueLink.metadata ? JSON.parse(issueLink.metadata) : {}),
          state: "open",
        },
      });
    }
  } catch (error) {
    console.error("Failed to update GitHub issue status:", error);
  }
}

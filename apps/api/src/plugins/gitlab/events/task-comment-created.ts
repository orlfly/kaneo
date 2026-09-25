import { findExternalLinkByTaskAndType } from "../../github/services/link-manager";
import type { PluginContext, TaskCommentCreatedEvent } from "../../types";
import type { GitLabConfig } from "../config";
import { createGitLabClient } from "../utils/gitlab-api";

export async function handleTaskCommentCreated(
  event: TaskCommentCreatedEvent,
  context: PluginContext,
): Promise<void> {
  const config = context.config as GitLabConfig;
  if (!config.baseUrl || !config.accessToken) {
    return;
  }

  const { repositoryOwner, repositoryName } = config;

  const existingLink = await findExternalLinkByTaskAndType(
    event.taskId,
    context.integrationId,
    "issue",
  );

  if (!existingLink) {
    return;
  }

  try {
    const client = createGitLabClient(config);
    if (!/^\d+$/.test(existingLink.externalId)) {
      console.error(
        "Skipping GitLab comment sync for invalid external issue id",
        {
          taskId: event.taskId,
          externalId: existingLink.externalId,
        },
      );
      return;
    }

    const issueNumber = Number(existingLink.externalId);

    if (!Number.isFinite(issueNumber) || issueNumber < 1) {
      console.error("Skipping GitLab comment sync for invalid issue number", {
        taskId: event.taskId,
        externalId: existingLink.externalId,
        issueNumber,
      });
      return;
    }

    await client.createIssueComment(
      repositoryOwner,
      repositoryName,
      issueNumber,
      event.comment,
    );
  } catch (error) {
    console.error("Failed to create GitLab comment:", error);
  }
}

import {
  createExternalLink,
  findExternalLinkByTaskAndType,
} from "../../github/services/link-manager";
import {
  formatIssueBody,
  formatIssueTitle,
  getLabelsForIssue,
} from "../../github/utils/format";
import type { PluginContext, TaskCreatedEvent } from "../../types";
import type { GitLabConfig } from "../config";
import { createGitLabClient } from "../utils/gitlab-api";
import { addLabelsToIssueGitLab } from "../utils/labels";

export async function handleTaskCreated(
  event: TaskCreatedEvent,
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

  if (existingLink) {
    return;
  }

  try {
    const client = createGitLabClient(config);
    const createdIssue = await client.createIssue(
      repositoryOwner,
      repositoryName,
      {
        title: formatIssueTitle(event.title),
        body: formatIssueBody(event.description, event.taskId),
      },
    );

    await createExternalLink({
      taskId: event.taskId,
      integrationId: context.integrationId,
      resourceType: "issue",
      externalId: createdIssue.number.toString(),
      url: createdIssue.html_url,
      title: createdIssue.title,
      metadata: {
        state: createdIssue.state,
        createdFrom: "kaneo",
        lastOutboundStateSyncAt: Date.now(),
      },
    });

    const labels = getLabelsForIssue(event.priority, event.status);
    await addLabelsToIssueGitLab(config, createdIssue.number, labels);
  } catch (error) {
    console.error("Failed to create GitLab issue:", error);
  }
}

import { publishEvent } from "../../../events";
import {
  createExternalLink,
  findExternalLink,
} from "../../github/services/link-manager";
import {
  findTaskByNumber,
  isTaskInFinalState,
  updateTaskStatus,
} from "../../github/services/task-service";
import type { GitLabConfig } from "../config";
import { findAllIntegrationsByGitLabRepo } from "../services/integration-lookup";
import { extractTaskNumberGitLab } from "../utils/branch-matcher";
import { resolveTargetStatus } from "../utils/resolve-column";
import { baseUrlFromProject, splitProjectPath } from "../utils/webhook-repo";

type MergeRequestOpenedPayload = {
  object_attributes: {
    iid: number;
    title: string;
    description: string | null;
    url: string;
    state: string;
    source_branch: string;
    draft?: boolean;
    work_in_progress?: boolean;
  };
  project: {
    id: number;
    path_with_namespace: string;
    web_url: string;
  };
  user?: { username?: string };
};

export async function handleGitLabMergeRequestOpened(
  payload: MergeRequestOpenedPayload,
  integrationId?: string,
) {
  const { object_attributes: pr, project } = payload;

  const baseUrl = baseUrlFromProject(project);
  if (!baseUrl) return;

  const { owner, name } = splitProjectPath(project.path_with_namespace);
  const integrations = await findAllIntegrationsByGitLabRepo(
    baseUrl,
    owner,
    name,
    integrationId,
  );

  for (const integration of integrations) {
    if (!integration.project) {
      continue;
    }

    let config: GitLabConfig;
    try {
      config = JSON.parse(integration.config) as GitLabConfig;
    } catch (error) {
      console.error("Invalid GitLab config for integration", {
        integrationId: integration.id,
        error,
      });
      continue;
    }
    const projectSlug = integration.project.slug;
    const branchName = pr.source_branch;

    const taskNumber = extractTaskNumberGitLab(
      branchName,
      pr.title,
      pr.description ?? undefined,
      config,
      projectSlug,
    );

    if (!taskNumber) {
      continue;
    }

    const task = await findTaskByNumber(integration.projectId, taskNumber);

    if (!task) {
      continue;
    }

    const existingLink = await findExternalLink(
      integration.id,
      "pull_request",
      pr.iid.toString(),
    );

    if (existingLink) {
      continue;
    }

    const isDraft = pr.draft === true || pr.work_in_progress === true;

    await createExternalLink({
      taskId: task.id,
      integrationId: integration.id,
      resourceType: "pull_request",
      externalId: pr.iid.toString(),
      url: pr.url,
      title: pr.title,
      metadata: {
        state: "opened",
        draft: isDraft,
        merged: false,
        branch: branchName,
        author: payload.user?.username,
      },
    });

    const targetStatus = await resolveTargetStatus(
      integration.projectId,
      "pr_opened",
      config.statusTransitions?.onPROpen || "in-review",
    );

    const isTaskFinal = await isTaskInFinalState(task);

    if (task.status !== targetStatus && !isTaskFinal) {
      const statusResult = await updateTaskStatus(task.id, targetStatus);
      if (
        statusResult.applied &&
        statusResult.before.status !== statusResult.after.status
      ) {
        await publishEvent("task.status_changed", {
          taskId: statusResult.after.id,
          projectId: statusResult.after.projectId,
          userId: null,
          oldStatus: statusResult.before.status,
          newStatus: statusResult.after.status,
          title: statusResult.after.title,
          assigneeId: statusResult.after.userId,
          type: "status_changed",
        });
      }
    }

    return;
  }
}

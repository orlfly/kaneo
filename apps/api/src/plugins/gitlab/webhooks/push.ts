import { publishEvent } from "../../../events";
import { createOrUpdateExternalLink } from "../../github/services/link-manager";
import {
  findTaskByNumber,
  isTaskInFinalState,
  updateTaskStatus,
} from "../../github/services/task-service";
import type { GitLabConfig } from "../config";
import { findAllIntegrationsByGitLabRepo } from "../services/integration-lookup";
import { extractTaskNumberFromBranchGitLab } from "../utils/branch-matcher";
import { resolveTargetStatus } from "../utils/resolve-column";
import { baseUrlFromProject, splitProjectPath } from "../utils/webhook-repo";

type PushPayload = {
  ref: string;
  after?: string;
  user_username?: string;
  commits?: Array<{
    id: string;
    message: string;
    author?: { name: string; username?: string };
    timestamp?: string;
  }>;
  project: {
    id: number;
    path_with_namespace: string;
    web_url: string;
  };
};

const PROTECTED_BRANCHES = [
  "main",
  "master",
  "develop",
  "staging",
  "production",
];

export async function handleGitLabPush(
  payload: PushPayload,
  integrationId?: string,
) {
  const { ref, project } = payload;

  if (!ref.startsWith("refs/heads/")) {
    console.log(`[GitLab Push] Skipping non-branch ref: ${ref}`);
    return;
  }

  const branchName = ref.slice("refs/heads/".length);
  console.log(`[GitLab Push] Processing branch: ${branchName}`);

  if (PROTECTED_BRANCHES.includes(branchName)) {
    console.log(`[GitLab Push] Skipping protected branch: ${branchName}`);
    return;
  }

  const baseUrl = baseUrlFromProject(project);
  if (!baseUrl) {
    return;
  }
  const { owner, name } = splitProjectPath(project.path_with_namespace);
  const integrations = await findAllIntegrationsByGitLabRepo(
    baseUrl,
    owner,
    name,
    integrationId,
  );

  if (integrations.length === 0) {
    return;
  }

  const headCommit = payload.commits?.[payload.commits.length - 1];

  for (const integration of integrations) {
    if (!integration.project) {
      continue;
    }

    let config: GitLabConfig;
    try {
      config = JSON.parse(integration.config) as GitLabConfig;
    } catch (error) {
      console.error("Invalid GitLab integration config for push webhook", {
        integrationId: integration.id,
        error,
      });
      continue;
    }
    const projectSlug = integration.project.slug;

    const taskNumber = extractTaskNumberFromBranchGitLab(
      branchName,
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

    const treeUrl = `${project.web_url}/-/tree/${branchName}`;

    await createOrUpdateExternalLink({
      taskId: task.id,
      integrationId: integration.id,
      resourceType: "branch",
      externalId: branchName,
      url: treeUrl,
      title: branchName,
      metadata: {
        lastCommit: headCommit
          ? {
              sha: headCommit.id,
              message: headCommit.message,
              author: headCommit.author?.name,
              timestamp: headCommit.timestamp,
            }
          : null,
      },
    });

    const targetStatus = await resolveTargetStatus(
      integration.projectId,
      "branch_push",
      config.statusTransitions?.onBranchPush || "in-progress",
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
  }
}

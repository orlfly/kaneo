import { and, eq } from "drizzle-orm";
import db from "../../../database";
import { externalLinkTable } from "../../../database/schema";
import { publishEvent } from "../../../events";
import { updateExternalLink } from "../../github/services/link-manager";
import {
  findTaskById,
  updateTaskStatus,
} from "../../github/services/task-service";
import type { GitLabConfig } from "../config";
import { findAllIntegrationsByGitLabRepo } from "../services/integration-lookup";
import { resolveTargetStatus } from "../utils/resolve-column";
import { baseUrlFromProject, splitProjectPath } from "../utils/webhook-repo";

type MergeRequestClosedPayload = {
  object_attributes: {
    iid: number;
    title: string;
    url: string;
    state: string;
    action: string;
    source_branch: string;
    merged_at?: string | null;
  };
  project: {
    id: number;
    path_with_namespace: string;
    web_url: string;
  };
};

export async function handleGitLabMergeRequestClosed(
  payload: MergeRequestClosedPayload,
  integrationId?: string,
) {
  const { object_attributes: pr, project } = payload;

  const merged = pr.action === "merge" || pr.state === "merged";

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
    const config = JSON.parse(integration.config) as GitLabConfig;

    const externalLink = await db.query.externalLinkTable.findFirst({
      where: and(
        eq(externalLinkTable.integrationId, integration.id),
        eq(externalLinkTable.resourceType, "pull_request"),
        eq(externalLinkTable.externalId, pr.iid.toString()),
      ),
    });

    if (!externalLink) {
      continue;
    }

    const task = await findTaskById(externalLink.taskId);

    if (!task) {
      continue;
    }

    const existingMetadata = externalLink.metadata
      ? JSON.parse(externalLink.metadata)
      : {};

    await updateExternalLink(externalLink.id, {
      metadata: {
        ...existingMetadata,
        state: "closed",
        merged,
        mergedAt: pr.merged_at,
      },
    });

    if (merged) {
      const allTaskPRs = await db.query.externalLinkTable.findMany({
        where: and(
          eq(externalLinkTable.taskId, task.id),
          eq(externalLinkTable.resourceType, "pull_request"),
        ),
      });

      const hasOpenPRs = allTaskPRs.some((prRow) => {
        if (prRow.id === externalLink.id) return false;
        const metadata = prRow.metadata ? JSON.parse(prRow.metadata) : {};
        return metadata.state === "open";
      });

      if (!hasOpenPRs) {
        const targetStatus = await resolveTargetStatus(
          integration.projectId,
          "pr_merged",
          config.statusTransitions?.onPRMerge || "done",
        );
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

    return;
  }
}

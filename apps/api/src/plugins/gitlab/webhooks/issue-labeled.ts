import { eq, inArray } from "drizzle-orm";
import db from "../../../database";
import { labelTable, taskTable } from "../../../database/schema";
import { publishEvent } from "../../../events";
import { findExternalLink } from "../../github/services/link-manager";
import { updateTaskStatus } from "../../github/services/task-service";
import {
  extractIssuePriority,
  extractIssueStatus,
} from "../../github/utils/extract-priority";
import { findAllIntegrationsByGitLabRepo } from "../services/integration-lookup";
import { isSystemLabelName } from "../utils/system-labels";
import { baseUrlFromProject, splitProjectPath } from "../utils/webhook-repo";

type IssueLabeledPayload = {
  object_attributes: {
    iid: number;
    labels?: string[];
    action?: string;
  };
  changes?: {
    labels?: { previous?: string[]; current?: string[] };
  };
  project: {
    id: number;
    path_with_namespace: string;
    web_url: string;
  };
};

async function syncGitLabLabelsToTask(
  taskId: string,
  teamId: string,
  gitlabLabels: string[],
) {
  const nonSystemNames = gitlabLabels.filter(
    (name) => !isSystemLabelName(name),
  );
  const desiredNames = new Set(nonSystemNames);
  const existingRows = await db.query.labelTable.findMany({
    where: eq(labelTable.taskId, taskId),
  });

  const labelsToInsert = nonSystemNames
    .filter((name) => !existingRows.some((row) => row.name === name))
    .map((name) => ({
      name,
      color: "#6B7280",
      taskId,
      teamId,
    }));

  if (labelsToInsert.length > 0) {
    await db
      .insert(labelTable)
      .values(labelsToInsert)
      .onConflictDoNothing({
        target: [labelTable.taskId, labelTable.name],
      });
  }

  const labelsToDelete = existingRows
    .filter(
      (row) => !desiredNames.has(row.name) && !isSystemLabelName(row.name),
    )
    .map((row) => row.id);

  if (labelsToDelete.length > 0) {
    await db.delete(labelTable).where(inArray(labelTable.id, labelsToDelete));
  }
}

export async function handleGitLabIssueLabeled(
  payload: IssueLabeledPayload,
  integrationId?: string,
) {
  const { object_attributes: issue, project } = payload;

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
    try {
      const existingLink = await findExternalLink(
        integration.id,
        "issue",
        issue.iid.toString(),
      );

      if (!existingLink) {
        continue;
      }

      const currentLabels = payload.changes?.labels?.current ?? issue.labels;
      if (!currentLabels) {
        continue;
      }

      const priority = extractIssuePriority(currentLabels);
      const status = extractIssueStatus(currentLabels);

      if (priority) {
        await db
          .update(taskTable)
          .set({ priority })
          .where(eq(taskTable.id, existingLink.taskId));
      }

      if (status) {
        const statusResult = await updateTaskStatus(
          existingLink.taskId,
          status,
        );
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

      const task = await db.query.taskTable.findFirst({
        where: eq(taskTable.id, existingLink.taskId),
        with: {
          project: true,
        },
      });
      if (task?.project?.teamId) {
        await syncGitLabLabelsToTask(
          existingLink.taskId,
          task.project.teamId,
          currentLabels,
        );
      }
    } catch (error) {
      console.error("GitLab issue_labeled handler failed for integration", {
        integrationId: integration.id,
        issueNumber: issue.iid,
        repository: project.path_with_namespace,
        error,
      });
    }
  }
}

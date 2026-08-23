import { eq } from "drizzle-orm";
import db from "../../../database";
import { taskTable } from "../../../database/schema";
import {
  findExternalLink,
  updateExternalLink,
} from "../../github/services/link-manager";
import { formatTaskDescriptionFromIssue } from "../../github/utils/format";
import { findAllIntegrationsByGitLabRepo } from "../services/integration-lookup";
import { baseUrlFromProject, splitProjectPath } from "../utils/webhook-repo";

type IssueEditedPayload = {
  object_attributes: {
    iid: number;
    title: string;
    description: string | null;
    url: string;
  };
  changes?: {
    title?: { previous?: string };
    description?: { previous?: string };
    labels?: { previous?: string[]; current?: string[] };
  };
  project: {
    id: number;
    path_with_namespace: string;
    web_url: string;
  };
};

export async function handleGitLabIssueEdited(
  payload: IssueEditedPayload,
  integrationId?: string,
) {
  const { object_attributes: issue, project, changes } = payload;

  if (!changes?.title && !changes?.description) {
    return;
  }

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
    const externalLink = await findExternalLink(
      integration.id,
      "issue",
      issue.iid.toString(),
    );

    if (!externalLink) {
      continue;
    }

    const task = await db.query.taskTable.findFirst({
      where: eq(taskTable.id, externalLink.taskId),
    });

    if (!task) {
      continue;
    }

    const metadata = externalLink.metadata
      ? JSON.parse(externalLink.metadata)
      : {};

    const updateData: Record<string, unknown> = {};
    const updatedMetadata = { ...metadata };

    if (!updatedMetadata.lastSync) {
      updatedMetadata.lastSync = {};
    }

    if (changes.title) {
      const lastTitleSync = metadata.lastSync?.title;

      let shouldUpdateTitle = true;

      if (lastTitleSync) {
        if (
          lastTitleSync.value === issue.title &&
          lastTitleSync.source === "kaneo"
        ) {
          shouldUpdateTitle = false;
        }

        const timeSinceLastSync =
          Date.now() - new Date(lastTitleSync.timestamp).getTime();
        if (timeSinceLastSync < 2000 && shouldUpdateTitle) {
          shouldUpdateTitle = false;
        }
      }

      if (shouldUpdateTitle) {
        updateData.title = issue.title;
        updatedMetadata.lastSync.title = {
          timestamp: new Date().toISOString(),
          source: "gitlab",
          value: issue.title,
        };
      }
    }

    if (changes.description) {
      const lastDescSync = metadata.lastSync?.description;
      const formattedDescription = formatTaskDescriptionFromIssue(
        issue.description,
      );

      let shouldUpdateDescription = true;

      if (lastDescSync) {
        if (
          lastDescSync.value === formattedDescription &&
          lastDescSync.source === "kaneo"
        ) {
          shouldUpdateDescription = false;
        }

        const timeSinceLastSync =
          Date.now() - new Date(lastDescSync.timestamp).getTime();
        if (timeSinceLastSync < 2000 && shouldUpdateDescription) {
          shouldUpdateDescription = false;
        }
      }

      if (shouldUpdateDescription) {
        updateData.description = formattedDescription;
        updatedMetadata.lastSync.description = {
          timestamp: new Date().toISOString(),
          source: "gitlab",
          value: formattedDescription,
        };
      }
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .update(taskTable)
        .set(updateData)
        .where(eq(taskTable.id, task.id));

      await updateExternalLink(externalLink.id, {
        title: issue.title,
        metadata: updatedMetadata,
      });
    }

    return;
  }
}

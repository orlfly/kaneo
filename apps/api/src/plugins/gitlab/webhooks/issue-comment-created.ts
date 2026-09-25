import db from "../../../database";
import { activityTable } from "../../../database/schema";
import { findExternalLink } from "../../github/services/link-manager";
import { findAllIntegrationsByGitLabRepo } from "../services/integration-lookup";
import { baseUrlFromProject, splitProjectPath } from "../utils/webhook-repo";

type IssueCommentCreatedPayload = {
  object_attributes: {
    id: number;
    note: string;
    noteable_type: string;
    url: string;
    created_at: string;
  };
  issue?: {
    iid: number;
  };
  project: {
    id: number;
    path_with_namespace: string;
    web_url: string;
  };
  user?: { username?: string; avatar_url?: string };
};

export async function handleGitLabIssueCommentCreated(
  payload: IssueCommentCreatedPayload,
  integrationId?: string,
) {
  const { object_attributes: comment, issue, project } = payload;

  if (!issue || comment.noteable_type !== "Issue") {
    return;
  }

  const username = payload.user?.username ?? "";
  if (username.endsWith("[bot]")) {
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
    const existingLink = await findExternalLink(
      integration.id,
      "issue",
      issue.iid.toString(),
    );

    if (!existingLink) {
      continue;
    }

    await db
      .insert(activityTable)
      .values({
        taskId: existingLink.taskId,
        type: "comment",
        content: comment.note,
        externalUserName: username || "Unknown",
        externalUserAvatar: payload.user?.avatar_url ?? null,
        externalSource: "gitlab",
        externalUrl: comment.url,
        eventData: {
          externalCommentId: comment.id,
        },
      })
      .onConflictDoNothing({
        target: [
          activityTable.taskId,
          activityTable.externalSource,
          activityTable.externalUrl,
        ],
      });
  }
}

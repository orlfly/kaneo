import { sql } from "drizzle-orm";
import db from "../../../database";
import { labelTable } from "../../../database/schema";
import { findAllIntegrationsByGitLabRepo } from "../services/integration-lookup";
import { baseUrlFromProject, splitProjectPath } from "../utils/webhook-repo";

type LabelCreatePayload = {
  object_attributes?: {
    action?: string;
    name?: string;
    color?: string;
  };
  label?: {
    name: string;
    color: string;
  };
  project: {
    id: number;
    path_with_namespace: string;
    web_url: string;
  };
};

export async function handleGitLabLabelCreated(
  payload: LabelCreatePayload,
  integrationId?: string,
) {
  const attributes = payload.object_attributes ?? {};
  const action = attributes.action ?? "create";
  if (action !== "create") {
    return;
  }

  const name = payload.label?.name ?? attributes.name;
  const color = payload.label?.color ?? attributes.color;
  if (!name) {
    return;
  }

  const { project } = payload;

  const baseUrl = baseUrlFromProject(project);
  if (!baseUrl) return;

  const { owner, name: repoName } = splitProjectPath(
    project.path_with_namespace,
  );
  const integrations = await findAllIntegrationsByGitLabRepo(
    baseUrl,
    owner,
    repoName,
    integrationId,
  );

  for (const integration of integrations) {
    if (!integration.project) {
      continue;
    }

    const teamId = integration.project.teamId;
    if (!teamId) {
      continue;
    }

    const normalizedColor = color ? `#${color.replace(/^#/, "")}` : "#6B7280";

    await db
      .insert(labelTable)
      .values({
        name,
        color: normalizedColor,
        teamId,
      })
      .onConflictDoNothing({
        target: [labelTable.teamId, labelTable.name],
        where: sql`${labelTable.taskId} is null`,
      });
  }
}

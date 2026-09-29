import { and, count, eq, inArray, lt, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  integrationTable,
  projectTable,
  taskTable,
  teamTable,
} from "../../database/schema";
import type { ProjectContextBundle } from "../context";

/**
 * Build the project context bundle for task-executing agents. Everything is
 * assembled from an explicit field whitelist: the raw integration config
 * (tokens, installation IDs) is never read into the result.
 */
export async function getProjectContext({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId?: string;
}): Promise<ProjectContextBundle> {
  const [project] = await db
    .select({
      id: projectTable.id,
      name: projectTable.name,
      slug: projectTable.slug,
      description: projectTable.description,
      teamId: projectTable.teamId,
    })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const [[team], columns] = await Promise.all([
    db
      .select({ name: teamTable.name })
      .from(teamTable)
      .where(eq(teamTable.id, project.teamId))
      .limit(1),
    db
      .select({ slug: columnTable.slug })
      .from(columnTable)
      .where(eq(columnTable.projectId, projectId)),
  ]);

  const statusRows = await db
    .select({ status: taskTable.status, value: count() })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId))
    .groupBy(taskTable.status);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows) {
    const n = Number(row.value);
    byStatus[row.status] = n;
    total += n;
  }

  const [overdueRows] = await db
    .select({ value: count() })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        lt(taskTable.dueDate, new Date()),
        ne(taskTable.status, "done"),
        ne(taskTable.status, "archived"),
      ),
    );

  const [integration] = await db
    .select({ type: integrationTable.type, config: integrationTable.config })
    .from(integrationTable)
    .where(
      and(
        eq(integrationTable.projectId, projectId),
        inArray(integrationTable.type, ["github", "gitlab", "gitea"]),
        eq(integrationTable.isActive, true),
      ),
    )
    .limit(1);

  // Whitelist the repository identity out of the stored config; credentials
  // (installationId, accessToken) stay unparsed beyond this field access.
  let repository: string | undefined;
  let vcsType: string | undefined;
  if (integration) {
    try {
      const config = JSON.parse(integration.config) as Record<string, unknown>;
      const owner =
        typeof config.repositoryOwner === "string"
          ? config.repositoryOwner
          : "";
      const name =
        typeof config.repositoryName === "string" ? config.repositoryName : "";
      if (owner && name) {
        repository = `${owner}/${name}`;
        vcsType = integration.type;
      }
    } catch {
      // Invalid config: report as not connected rather than failing.
    }
  }

  let task: Record<string, unknown> | undefined;
  if (taskId) {
    const [row] = await db
      .select()
      .from(taskTable)
      .where(and(eq(taskTable.id, taskId), eq(taskTable.projectId, projectId)))
      .limit(1);
    if (!row) {
      throw new HTTPException(404, {
        message: "Task not found in this project",
      });
    }
    task = row as unknown as Record<string, unknown>;
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description ?? "",
      teamName: team?.name ?? "",
    },
    statuses: columns.map((c) => c.slug),
    taskSummary: {
      total,
      byStatus,
      overdue: Number(overdueRows?.value ?? 0),
    },
    vcs: {
      connected: Boolean(vcsType),
      ...(vcsType ? { type: vcsType } : {}),
      ...(repository ? { repository } : {}),
    },
    ...(task ? { task } : {}),
    checkedAt: new Date().toISOString(),
  };
}

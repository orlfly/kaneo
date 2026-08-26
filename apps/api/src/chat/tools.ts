import { createId } from "@paralleldrive/cuid2";
import { and, count, eq, ilike, sql } from "drizzle-orm";
import db from "../database";
import { columnTable, projectTable, taskTable } from "../database/schema";
import { resolveVcsIntegration, vcsListPullRequests } from "../vcs";
import type { ChatCompletionTool } from "./pi-agent-client";

export const toolDefinitions: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_tasks",
      description:
        "List tasks in the current project. Optionally filter by status or priority.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "Filter by task status (e.g. to-do, in-progress, done)",
          },
          priority: {
            type: "string",
            description: "Filter by priority (e.g. low, medium, high)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_task",
      description: "Get details of a single task by its ID.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "The task ID",
          },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create a new task in the current project. Requires a title. Optionally set priority and status.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "The task title" },
          priority: {
            type: "string",
            description: "Task priority: low, medium, or high (default: low)",
          },
          status: {
            type: "string",
            description: "Initial status (default: to-do)",
          },
          description: {
            type: "string",
            description: "Optional task description in markdown",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_summary",
      description:
        "Get a summary of the project: total tasks, status breakdown, and overdue count.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_blocked_tasks",
      description:
        "List all tasks in the project that are paused with a reason. As project manager, use this to identify blocked tasks that need attention.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_merge_requests",
      description:
        "List the open merge/pull requests (MRs) on the project's connected version-control repository (GitHub, GitLab, or Gitea). Use this when asked about the project's MRs, PRs, or merge requests.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["github", "gitlab", "gitea"],
            description:
              "Which VCS integration to query. The project may have multiple; use the one the user asked about, or try each configured integration.",
          },
        },
      },
    },
  },
];

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  projectId: string,
): Promise<string> {
  switch (toolName) {
    case "list_tasks":
      return listTasks(projectId, args);
    case "get_task":
      return getTask(projectId, String(args.taskId));
    case "create_task":
      return createTask(projectId, args);
    case "get_project_summary":
      return getProjectSummary(projectId);
    case "list_blocked_tasks":
      return listBlockedTasks(projectId);
    case "list_merge_requests":
      return listMergeRequests(projectId, args);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

async function listTasks(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const conditions = [eq(taskTable.projectId, projectId)];
  if (typeof args.status === "string") {
    conditions.push(ilike(taskTable.status, args.status));
  }
  if (typeof args.priority === "string") {
    conditions.push(ilike(taskTable.priority, args.priority));
  }

  const rows = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      status: taskTable.status,
      priority: taskTable.priority,
      dueDate: taskTable.dueDate,
      number: taskTable.number,
    })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId))
    .limit(50);

  return JSON.stringify(rows, null, 2);
}

async function getTask(projectId: string, taskId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!row || row.projectId !== projectId) {
    return JSON.stringify({ error: "Task not found" });
  }

  return JSON.stringify(row, null, 2);
}

async function createTask(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const title = String(args.title ?? "").trim();
  if (!title) {
    return JSON.stringify({ error: "Title is required" });
  }

  // Find the first column to place the task (or null if no columns)
  const [firstColumn] = await db
    .select({ id: columnTable.id })
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId))
    .limit(1);

  // Claim the next task number atomically. `number` is unique per project,
  // and the project counter can lag behind tasks created outside the claim
  // flow, so start above both the counter and any existing task number.
  const [claimed] = await db
    .update(projectTable)
    .set({
      lastTaskNumber: sql`GREATEST(${projectTable.lastTaskNumber}, (SELECT COALESCE(MAX(${taskTable.number}), 0) FROM ${taskTable} WHERE ${taskTable.projectId} = ${projectId})) + 1`,
    })
    .where(eq(projectTable.id, projectId))
    .returning({ lastTaskNumber: projectTable.lastTaskNumber });
  const number = claimed?.lastTaskNumber ?? 1;

  const taskId = createId();
  const now = new Date();

  await db.insert(taskTable).values({
    id: taskId,
    projectId,
    number,
    title,
    description: typeof args.description === "string" ? args.description : null,
    status: typeof args.status === "string" ? args.status : "to-do",
    priority: typeof args.priority === "string" ? args.priority : "low",
    columnId: firstColumn?.id ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return JSON.stringify({ id: taskId, title, created: true });
}

async function getProjectSummary(projectId: string): Promise<string> {
  const [project] = await db
    .select({ name: projectTable.name })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);

  const totalRows = await db
    .select({ value: count() })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId));
  const total = totalRows[0]?.value ?? 0;

  // Get status distribution
  const statusRows = await db
    .select({
      status: taskTable.status,
      count: count(),
    })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId))
    .groupBy(taskTable.status);

  const byStatus: Record<string, number> = {};
  for (const row of statusRows) {
    byStatus[row.status] = Number(row.count);
  }

  // Count overdue tasks
  const now = new Date();
  const overdueRows = await db
    .select({ value: count() })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId));

  return JSON.stringify(
    {
      projectName: project?.name,
      totalTasks: Number(total),
      byStatus,
      overdue: Number(overdueRows[0]?.value ?? 0),
      checkedAt: now.toISOString(),
    },
    null,
    2,
  );
}

async function listBlockedTasks(projectId: string): Promise<string> {
  const blocked = await db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      priority: taskTable.priority,
      pausedReason: taskTable.pausedReason,
      assigneeId: taskTable.userId,
      dueDate: taskTable.dueDate,
    })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        ilike(taskTable.status, "paused"),
      ),
    );

  return JSON.stringify(blocked, null, 2);
}

async function listMergeRequests(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const requestedType = typeof args.type === "string" ? args.type : undefined;
  const types = requestedType
    ? [requestedType]
    : (["github", "gitlab", "gitea"] as const);

  const results: Record<string, unknown> = {};
  for (const type of types) {
    let integration:
      | Awaited<ReturnType<typeof resolveVcsIntegration>>
      | undefined;
    try {
      integration = await resolveVcsIntegration(projectId, type as never);
    } catch {
      // No active integration of this type; skip it.
      continue;
    }
    try {
      const pulls = await vcsListPullRequests(integration as never);
      results[type] = pulls;
    } catch (error) {
      results[type] = {
        error:
          error instanceof Error
            ? error.message
            : "Failed to list pull requests",
      };
    }
  }

  if (Object.keys(results).length === 0) {
    return JSON.stringify({
      error:
        "No version-control integration (GitHub, GitLab, or Gitea) is configured for this project.",
    });
  }
  return JSON.stringify(results, null, 2);
}

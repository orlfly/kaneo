import { createId } from "@paralleldrive/cuid2";
import { count, eq, ilike } from "drizzle-orm";
import db from "../database";
import { columnTable, projectTable, taskTable } from "../database/schema";
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

  const taskId = createId();
  const now = new Date();

  await db.insert(taskTable).values({
    id: taskId,
    projectId,
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

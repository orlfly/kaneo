import { and, count, eq, ilike } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  agentCloneRepo,
  agentDeleteFile,
  agentListFiles,
  agentReadFile,
  agentRunCommand,
  agentSearchFiles,
  agentWriteFile,
  defaultWorkdirRoot,
  ensureProjectWorkdir,
  projectWorkdir,
} from "../agent";
import db from "../database";
import { integrationTable, projectTable, taskTable } from "../database/schema";
import createTaskController from "../task/controllers/create-task";
import updateTaskStatus from "../task/controllers/update-task-status";
import createTaskRelation from "../task-relation/controllers/create-task-relation";
import deleteTaskRelation from "../task-relation/controllers/delete-task-relation";
import getTaskRelations from "../task-relation/controllers/get-task-relations";
import { vcsListPullRequests } from "../vcs";
import { resolveVcsIntegration, type VcsType } from "../vcs/resolve";
import { loadChatConfig } from "./config";
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
        "Create a new task in the current project. Requires a title. Optionally set priority, status, description, requiredRole (agent role), schedule dates (startDate/dueDate), and dependencies (relations to existing tasks). Every task needs startDate and dueDate to appear on the Gantt chart.",
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
          startDate: {
            type: "string",
            description:
              'Scheduled start date, ISO 8601 (e.g. "2025-01-15"). Defaults to today.',
          },
          dueDate: {
            type: "string",
            description:
              'Scheduled due date, ISO 8601 (e.g. "2025-01-20"). Estimate from task size and start date; must not be before startDate.',
          },
          requiredRole: {
            type: "string",
            description:
              "Agent role required for this task: coding, product-design, architecture-design, devops, ui-design, testing, or code-review. Omit for any agent.",
            enum: [
              "coding",
              "product-design",
              "architecture-design",
              "devops",
              "ui-design",
              "testing",
              "code-review",
            ],
          },
          dependencies: {
            type: "array",
            description:
              "Optional relations to existing tasks. Each entry declares a relation from this new task (source) to an existing task (target).",
            items: {
              type: "object",
              properties: {
                targetTaskId: {
                  type: "string",
                  description:
                    "The ID of the existing task this task depends on",
                },
                relationType: {
                  type: "string",
                  description:
                    "Relation type: 'subtask' (this task is a child of the target), 'blocks' (this task blocks the target), or 'related' (bidirectional).",
                  enum: ["subtask", "blocks", "related"],
                },
              },
              required: ["targetTaskId", "relationType"],
            },
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task_relation",
      description:
        "Create a relation between two tasks in the current project. relationType: 'subtask' (sourceTaskId is the parent, targetTaskId the child), 'blocks' (sourceTaskId blocks targetTaskId), or 'related' (bidirectional).",
      parameters: {
        type: "object",
        properties: {
          sourceTaskId: {
            type: "string",
            description: "The ID of the source task",
          },
          targetTaskId: {
            type: "string",
            description: "The ID of the target task",
          },
          relationType: {
            type: "string",
            description: "Relation type: 'subtask', 'blocks', or 'related'",
            enum: ["subtask", "blocks", "related"],
          },
        },
        required: ["sourceTaskId", "targetTaskId", "relationType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_task_relations",
      description:
        "List all relations (subtask/blocks/related) involving a task in the current project.",
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
      name: "delete_task_relation",
      description: "Delete a task relation by its relation ID.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The relation ID",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task_status",
      description:
        "Update the status of an existing task in the current project. Use this to complete a task (set status to 'done') or close/archive a task (set status to 'archived'), or move a task to another valid project status. The task status must be one of the project's valid statuses (e.g. to-do, in-progress, done, archived, planned, paused).",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "The ID of the task to update",
          },
          status: {
            type: "string",
            description:
              "The target status. Use 'done' to complete a task or 'archived' to close it. Other valid project statuses are also accepted.",
          },
        },
        required: ["taskId", "status"],
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
        "List the open merge/pull requests (MRs) from the project's connected version-control repository. The project is already wired to one VCS (GitHub, GitLab, or Gitea); this queries whichever is configured. Use this when asked about the project's MRs, PRs, or merge requests.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_clone_repo",
      description:
        "Clone the project's connected version-control repository into the agent working directory. If a clone already exists it is updated (pulled). Use this when asked to read, search, or analyze the project's source code or documentation.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_list_files",
      description:
        "List files and directories inside the agent working directory (which holds cloned repos and uploaded files).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Relative path inside the working directory (default: root).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_read_file",
      description:
        "Read a text file inside the agent working directory. Optionally pass offset/limit to page large files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative file path inside the working directory.",
          },
          offset: {
            type: "number",
            description: "Line offset (0-based) for paging.",
          },
          limit: {
            type: "number",
            description: "Max lines to read from the offset.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_write_file",
      description:
        "Write or overwrite a text file inside the agent working directory, creating parent directories as needed.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative file path inside the working directory.",
          },
          content: { type: "string", description: "File content." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_search_files",
      description:
        "Recursively search the agent working directory by filename and/or content keyword. Returns matching files with line numbers for content matches.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Filename substring to match (optional).",
          },
          content: {
            type: "string",
            description: "Content keyword to search for (optional).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_file",
      description: "Delete a file inside the agent working directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative file path inside the working directory.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_run_command",
      description:
        "Run a shell command with the agent working directory as the working directory. Captures stdout/stderr and exit code. Only available when command execution is enabled.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run." },
        },
        required: ["command"],
      },
    },
  },
];

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  projectId: string,
  userId: string,
): Promise<string> {
  switch (toolName) {
    case "list_tasks":
      return listTasks(projectId, args);
    case "get_task":
      return getTask(projectId, String(args.taskId));
    case "create_task":
      return createTaskTool(projectId, args, userId);
    case "create_task_relation":
      return createTaskRelationTool(projectId, args, userId);
    case "get_task_relations":
      return getTaskRelationsTool(projectId, args);
    case "delete_task_relation":
      return deleteTaskRelationTool(projectId, args, userId);
    case "update_task_status":
      return updateTaskStatusTool(projectId, args, userId);
    case "get_project_summary":
      return getProjectSummary(projectId);
    case "list_blocked_tasks":
      return listBlockedTasks(projectId);
    case "list_merge_requests":
      return listMergeRequests(projectId, args);
    case "agent_clone_repo":
      return agentClone(projectId, args);
    case "agent_list_files":
      return agentList(projectId, args);
    case "agent_read_file":
      return agentRead(projectId, args);
    case "agent_write_file":
      return agentWrite(projectId, args);
    case "agent_search_files":
      return agentSearch(projectId, args);
    case "agent_delete_file":
      return agentDelete(projectId, args);
    case "agent_run_command":
      return agentRun(projectId, args);
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

const DEFAULT_TASK_DURATION_DAYS = 3;

function parseScheduleDate(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HTTPException(400, {
      message: `Invalid ${fieldName} "${value}". Please provide a valid date string (e.g. "2025-01-15" or "2025-01-15T10:30:00Z").`,
    });
  }
  return parsed;
}

async function createTaskTool(
  projectId: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const title = String(args.title ?? "").trim();
  if (!title) {
    return JSON.stringify({ error: "Title is required" });
  }

  const startDateStr =
    typeof args.startDate === "string" ? args.startDate.trim() : "";
  const dueDateStr =
    typeof args.dueDate === "string" ? args.dueDate.trim() : "";

  // Agent-created tasks need a schedule to show up on the Gantt chart. Default
  // startDate to today and dueDate a few days out when the model omits them.
  let startDate: Date;
  let dueDate: Date;
  try {
    startDate = startDateStr
      ? parseScheduleDate(startDateStr, "startDate")
      : new Date();
    dueDate = dueDateStr
      ? parseScheduleDate(dueDateStr, "dueDate")
      : new Date(startDate.getTime() + DEFAULT_TASK_DURATION_DAYS * 86400000);
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Invalid schedule dates",
    });
  }

  if (startDate.getTime() > dueDate.getTime()) {
    return JSON.stringify({
      error: "startDate cannot be after dueDate",
    });
  }

  try {
    const task = await createTaskController({
      projectId,
      currentUserId: userId,
      title,
      description:
        typeof args.description === "string" ? args.description : undefined,
      status: typeof args.status === "string" ? args.status : "to-do",
      priority: typeof args.priority === "string" ? args.priority : undefined,
      startDate,
      dueDate,
      requiredRole:
        typeof args.requiredRole === "string" ? args.requiredRole : null,
    });

    // Create declared dependencies (relations from the new task to existing
    // tasks). If any relation fails, delete the ones already created and
    // return an error so no partial dependencies remain.
    const dependencies = Array.isArray(args.dependencies)
      ? args.dependencies
      : [];
    const createdRelationIds: string[] = [];
    try {
      for (const dep of dependencies) {
        const targetTaskId = String(
          (dep as Record<string, unknown>)?.targetTaskId ?? "",
        ).trim();
        const relationType = String(
          (dep as Record<string, unknown>)?.relationType ?? "",
        ).trim();
        if (!targetTaskId || !relationType) {
          throw new Error(
            "Each dependency requires targetTaskId and relationType",
          );
        }
        const relation = await createTaskRelation({
          sourceTaskId: task.id,
          targetTaskId,
          relationType,
          userId,
          teamId: await resolveTeamId(projectId),
        });
        createdRelationIds.push(relation.id);
      }
    } catch (error) {
      for (const relationId of createdRelationIds) {
        await deleteTaskRelation(relationId, userId).catch(() => {});
      }
      return JSON.stringify({
        error:
          error instanceof Error
            ? `Failed to create task dependencies: ${error.message}`
            : "Failed to create task dependencies",
      });
    }

    return JSON.stringify({
      id: task.id,
      title: task.title,
      created: true,
      dependencies: createdRelationIds.length,
    });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to create task",
    });
  }
}

async function resolveTeamId(projectId: string): Promise<string> {
  const [project] = await db
    .select({ teamId: projectTable.teamId })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);
  if (!project) {
    throw new Error("Project not found");
  }
  return project.teamId;
}

async function createTaskRelationTool(
  projectId: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const sourceTaskId = String(args.sourceTaskId ?? "").trim();
  const targetTaskId = String(args.targetTaskId ?? "").trim();
  const relationType = String(args.relationType ?? "").trim();
  if (!sourceTaskId || !targetTaskId || !relationType) {
    return JSON.stringify({
      error: "sourceTaskId, targetTaskId, and relationType are required",
    });
  }

  try {
    const relation = await createTaskRelation({
      sourceTaskId,
      targetTaskId,
      relationType,
      userId,
      teamId: await resolveTeamId(projectId),
    });
    return JSON.stringify(relation, null, 2);
  } catch (error) {
    return JSON.stringify({
      error:
        error instanceof Error ? error.message : "Failed to create relation",
    });
  }
}

async function getTaskRelationsTool(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const taskId = String(args.taskId ?? "").trim();
  if (!taskId) {
    return JSON.stringify({ error: "taskId is required" });
  }

  try {
    const relations = await getTaskRelations(
      taskId,
      await resolveTeamId(projectId),
    );
    return JSON.stringify(relations, null, 2);
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to get relations",
    });
  }
}

async function deleteTaskRelationTool(
  _projectId: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const id = String(args.id ?? "").trim();
  if (!id) {
    return JSON.stringify({ error: "id is required" });
  }

  try {
    const relation = await deleteTaskRelation(id, userId);
    return JSON.stringify({ ok: true, id: relation.id }, null, 2);
  } catch (error) {
    return JSON.stringify({
      error:
        error instanceof Error ? error.message : "Failed to delete relation",
    });
  }
}

async function updateTaskStatusTool(
  projectId: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const taskId = String(args.taskId ?? "").trim();
  const status = String(args.status ?? "").trim();
  if (!taskId || !status) {
    return JSON.stringify({ error: "Both taskId and status are required" });
  }

  // Ensure the task belongs to the current project so pi-agent stays scoped.
  const [task] = await db
    .select({ id: taskTable.id, projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task || task.projectId !== projectId) {
    return JSON.stringify({ error: "Task not found in this project" });
  }

  try {
    const updated = await updateTaskStatus({
      id: taskId,
      status,
      currentUserId: userId,
    });
    return JSON.stringify(
      {
        ok: true,
        id: updated.id,
        title: updated.title,
        status: updated.status,
      },
      null,
      2,
    );
  } catch (error) {
    return JSON.stringify({
      error:
        error instanceof Error ? error.message : "Failed to update task status",
    });
  }
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
  _args: Record<string, unknown>,
): Promise<string> {
  // The project is wired to at most one active VCS integration. Find it from
  // the DB and query only that one, rather than probing each platform's
  // connection state.
  const connectedTypes = ["github", "gitlab", "gitea"] as const;
  const activeTypes: VcsType[] = [];
  for (const type of connectedTypes) {
    const integration = await db.query.integrationTable.findFirst({
      where: and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, type),
        eq(integrationTable.isActive, true),
      ),
    });
    if (integration) {
      activeTypes.push(type);
    }
  }

  if (activeTypes.length === 0) {
    return JSON.stringify({
      error:
        "This project has no connected version-control repository (GitHub, GitLab, or Gitea). Configure one in project settings to query merge requests.",
    });
  }

  const results: Record<string, unknown> = {};
  for (const type of activeTypes) {
    try {
      const integration = await resolveVcsIntegration(projectId, type);
      const pulls = await vcsListPullRequests(integration);
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

  return JSON.stringify(results, null, 2);
}

async function projectRoot(projectId: string): Promise<string> {
  const config = await loadChatConfig();
  const root = config.workdirRoot || defaultWorkdirRoot();
  const rootDir = projectWorkdir(root, projectId);
  await ensureProjectWorkdir(rootDir);
  return rootDir;
}

function relPath(_projectRoot: string, value: unknown): string {
  return String(value ?? ".");
}

async function agentClone(
  projectId: string,
  _args: Record<string, unknown>,
): Promise<string> {
  const activeTypes = ["github", "gitlab", "gitea"] as const;
  let found: VcsType | null = null;
  for (const type of activeTypes) {
    const integration = await db.query.integrationTable.findFirst({
      where: and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, type),
        eq(integrationTable.isActive, true),
      ),
    });
    if (integration) {
      found = type;
      break;
    }
  }

  if (!found) {
    return JSON.stringify({
      error:
        "This project has no connected version-control repository (GitHub, GitLab, or Gitea). Configure one in project settings to clone source code.",
    });
  }

  const root = await projectRoot(projectId);
  const integration = await resolveVcsIntegration(projectId, found);
  const result = await agentCloneRepo(root, integration);
  return JSON.stringify({ ok: true, ...result });
}

async function agentList(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const root = await projectRoot(projectId);
  const result = await agentListFiles(root, relPath(root, args.path));
  return JSON.stringify(result, null, 2);
}

async function agentRead(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const root = await projectRoot(projectId);
  const result = await agentReadFile(root, String(args.path), {
    offset: typeof args.offset === "number" ? args.offset : undefined,
    limit: typeof args.limit === "number" ? args.limit : undefined,
  });
  return JSON.stringify(result, null, 2);
}

async function agentWrite(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const root = await projectRoot(projectId);
  const result = await agentWriteFile(
    root,
    String(args.path),
    String(args.content),
  );
  return JSON.stringify({ ok: true, ...result }, null, 2);
}

async function agentSearch(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const root = await projectRoot(projectId);
  const result = await agentSearchFiles(root, {
    query: typeof args.query === "string" ? args.query : undefined,
    content: typeof args.content === "string" ? args.content : undefined,
  });
  return JSON.stringify(result, null, 2);
}

async function agentDelete(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const root = await projectRoot(projectId);
  const result = await agentDeleteFile(root, String(args.path));
  return JSON.stringify({ ok: true, ...result }, null, 2);
}

async function agentRun(
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const config = await loadChatConfig();
  if (!config.enableCommandExecution) {
    return JSON.stringify({
      error:
        "Command execution is not enabled on this instance. An admin can enable it in AI settings.",
    });
  }
  const root = await projectRoot(projectId);
  const command = String(args.command ?? "");
  if (!command.trim()) {
    return JSON.stringify({ error: "Command is required" });
  }
  const result = await agentRunCommand(root, command, config.commandTimeoutMs);
  return JSON.stringify(result, null, 2);
}

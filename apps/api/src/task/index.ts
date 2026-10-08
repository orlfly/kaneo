import type { AgentRole } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { assetTable, projectTable, taskTable } from "../database/schema";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import {
  assertTaskImageKeyMatchesContext,
  createTaskImageUploadUrl,
  InvalidUploadedAssetError,
  isImageContentType,
  validateTaskAssetUploadInput,
  verifyTaskAssetUpload,
} from "../storage/s3";
import { normalizeApiServerUrl } from "../utils/openapi-spec";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import {
  validateAndParseDate,
  validateDateRange,
} from "../utils/validate-dates";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import bulkUpdateTasks from "./controllers/bulk-update-tasks";
import { claimNextTask } from "./controllers/claim-next-task";
import claimTask from "./controllers/claim-task";
import createTask from "./controllers/create-task";
import deleteTask from "./controllers/delete-task";
import exportTasks from "./controllers/export-tasks";
import getTask from "./controllers/get-task";
import getTasks from "./controllers/get-tasks";
import importTasks from "./controllers/import-tasks";
import moveTask from "./controllers/move-task";
import pauseTask from "./controllers/pause-task";
import releaseTask from "./controllers/release-task";
import {
  requireBulkTaskEntitlement,
  requireBulkTaskPermission,
  requireTaskAssigneePermission,
} from "./controllers/require-task-permission";
import resumeTask from "./controllers/resume-task";
import updateTask from "./controllers/update-task";
import updateTaskAssignee from "./controllers/update-task-assignee";
import updateTaskDescription from "./controllers/update-task-description";
import updateTaskDueDate from "./controllers/update-task-due-date";
import updateTaskPriority from "./controllers/update-task-priority";
import updateTaskStatus from "./controllers/update-task-status";
import updateTaskTitle from "./controllers/update-task-title";
import {
  getDeferredDescriptionMatches,
  getDescriptionPage,
} from "./description-pages";
import {
  boardSchema,
  bulkResultSchema,
  descriptionMatchesSchema,
  descriptionPageSchema,
  finalizedAssetSchema,
  imageUploadSchema,
  moveTaskResultSchema,
  taskExportSchema,
  taskImportResultSchema,
  taskSchema,
  taskWithAssigneeSchema,
} from "./response";
import {
  bulkUpdateBody,
  claimNextBody,
  claimResultSchema,
  createTaskBody,
  descHasAcceptanceCriteria,
  descriptionMatchesQuery,
  descriptionPageQuery,
  finalizeImageUploadBody,
  imageUploadBody,
  importTasksBody,
  listTasksQuery,
  moveTaskBody,
  pauseTaskBody,
  projectIdParam,
  taskParam,
  updateAssigneeBody,
  updateDescriptionBody,
  updateDueDateBody,
  updatePriorityBody,
  updateStatusBody,
  updateTaskBody,
  updateTitleBody,
} from "./schema";

const listTasksRoute = createRoute({
  method: "get",
  operationId: "listTasks",
  path: "/tasks/{projectId}",
  tags: ["Tasks"],
  summary: "List tasks",
  description:
    "Get a project's board: its columns, each with the tasks in it, plus the archived and planned buckets. Responses always contain at most 100 tasks (50 by default). Continue through pagination.totalPages for the whole board, and for each task page follow relatedPage through pagination.relatedTotalPages for all labels, links and column metadata. Filters and sorting apply before pagination. Descriptions larger than 64 KiB are omitted with descriptionDeferred=true; read the task detail or description pages for full text.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam, query: listTasksQuery },
  responses: {
    200: jsonResponse("The project board", boardSchema),
    503: errorResponse("Task list request timed out"),
    400: errorResponse(
      "Unknown project, or its workspace could not be determined",
    ),
    403: errorResponse("No access to the project's workspace"),
  },
});

const bulkUpdateTasksRoute = createRoute({
  method: "patch",
  operationId: "bulkUpdateTasks",
  path: "/bulk",
  tags: ["Tasks"],
  summary: "Bulk update tasks",
  description:
    "Apply one operation to many tasks at once. Every task must be in the same workspace.",
  middleware: [
    workspaceAccess.fromTasks(),
    requireBulkTaskPermission,
    requireBulkTaskEntitlement,
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: bulkUpdateBody } },
    },
  },
  responses: {
    200: jsonResponse("Bulk operation result", bulkResultSchema),
    400: errorResponse("Invalid body, or the tasks span more than one team"),
    403: errorResponse(
      "No team access, or missing the permission the operation needs",
    ),
    404: errorResponse("No tasks found"),
  },
});

const createTaskRoute = createRoute({
  method: "post",
  operationId: "createTask",
  path: "/{projectId}",
  tags: ["Tasks"],
  summary: "Create task",
  description:
    "Add a task to a project. It is placed in the column named by `status`. Title must be human-readable (≥8 chars, not a branch/ticket/SHA). When authenticated with an API key (agent), the description must include an 'Acceptance Criteria' (or 验收标准) section, and an omitted requiredRole is defaulted to the agent's own role so the work is routed to the right claimer.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createTaskBody } },
    },
  },
  responses: {
    200: jsonResponse("The created task", taskSchema),
    400: errorResponse("Invalid body, or unknown project"),
    403: errorResponse(
      "No workspace access, or missing task:create permission",
    ),
  },
});

const getTaskRoute = createRoute({
  method: "get",
  operationId: "getTask",
  path: "/{id}",
  tags: ["Tasks"],
  summary: "Get task",
  description: "Get a single task by ID, with its assignee's name resolved.",
  middleware: [workspaceAccess.fromTask()] as const,
  request: { params: taskParam },
  responses: {
    200: jsonResponse("Task details", taskWithAssigneeSchema),
    400: errorResponse(
      "Unknown task, or its workspace could not be determined",
    ),
    403: errorResponse("No access to the task's workspace"),
  },
});

const moveTaskRoute = createRoute({
  method: "put",
  operationId: "moveTask",
  path: "/move/{id}",
  tags: ["Tasks"],
  summary: "Move task",
  description:
    "Move a task to another project, optionally into a named column. Both projects must be in the same workspace.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: moveTaskBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "The moved task, with both project ids",
      moveTaskResultSchema,
    ),
    400: errorResponse("Invalid body, or unknown task"),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
    404: errorResponse("Task or destination project not found"),
  },
});

const updateTaskRoute = createRoute({
  method: "put",
  operationId: "updateTask",
  path: "/{id}",
  tags: ["Tasks"],
  summary: "Update task",
  description:
    "Replace every field of a task. Use the single-field routes for narrower edits.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireTaskAssigneePermission,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateTaskBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body, or unknown task"),
    403: errorResponse(
      "No workspace access, or missing task:update or task:assign permission",
    ),
  },
});

const exportTasksRoute = createRoute({
  method: "get",
  operationId: "exportTasks",
  path: "/export/{projectId}",
  tags: ["Tasks"],
  summary: "Export tasks",
  description:
    "Export a project's tasks, with their labels, as a JSON document.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The exported project and tasks", taskExportSchema),
    400: errorResponse(
      "Unknown project, or its workspace could not be determined",
    ),
    403: errorResponse("No access to the project's workspace"),
  },
});

const importTasksRoute = createRoute({
  method: "post",
  operationId: "importTasks",
  path: "/import/{projectId}",
  tags: ["Tasks"],
  summary: "Import tasks",
  description:
    "Import tasks into a project. Each task is reported individually, so a partial import still returns 200.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: importTasksBody } },
    },
  },
  responses: {
    200: jsonResponse("Per-task import outcome", taskImportResultSchema),
    400: errorResponse("Invalid body, or unknown project"),
    403: errorResponse(
      "No workspace access, or missing task:create permission",
    ),
  },
});

const deleteTaskRoute = createRoute({
  method: "delete",
  operationId: "deleteTask",
  path: "/{id}",
  tags: ["Tasks"],
  summary: "Delete task",
  description:
    "Permanently delete a task and its comments, labels, and time entries.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["delete"] }),
  ] as const,
  request: { params: taskParam },
  responses: {
    200: jsonResponse("The deleted task", taskSchema),
    400: errorResponse(
      "Unknown task, or its workspace could not be determined",
    ),
    403: errorResponse(
      "No workspace access, or missing task:delete permission",
    ),
  },
});

const updateTaskStatusRoute = createRoute({
  method: "put",
  operationId: "updateTaskStatus",
  path: "/status/{id}",
  tags: ["Tasks"],
  summary: "Update task status",
  description: "Move a task to another column in the same project.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateStatusBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body, or unknown task"),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
  },
});

const updateTaskPriorityRoute = createRoute({
  method: "put",
  operationId: "updateTaskPriority",
  path: "/priority/{id}",
  tags: ["Tasks"],
  summary: "Update task priority",
  description: "Set a task's priority.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updatePriorityBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid priority, or unknown task"),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
  },
});

const updateTaskAssigneeRoute = createRoute({
  method: "put",
  operationId: "updateTaskAssignee",
  path: "/assignee/{id}",
  tags: ["Tasks"],
  summary: "Update task assignee",
  description:
    "Assign a task to a workspace member, or send null to unassign it.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["assign"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateAssigneeBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body, or unknown task"),
    403: errorResponse(
      "No workspace access, or missing task:assign permission",
    ),
    404: errorResponse("Assignee is not a member of the workspace"),
  },
});

const updateTaskDueDateRoute = createRoute({
  method: "put",
  operationId: "updateTaskDueDate",
  path: "/due-date/{id}",
  tags: ["Tasks"],
  summary: "Update task due date",
  description: "Set or clear a task's due date.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateDueDateBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid date, or unknown task"),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
  },
});

const updateTaskTitleRoute = createRoute({
  method: "put",
  operationId: "updateTaskTitle",
  path: "/title/{id}",
  tags: ["Tasks"],
  summary: "Update task title",
  description: "Rename a task.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateTitleBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body, or unknown task"),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
  },
});

const createTaskImageUploadRoute = createRoute({
  method: "put",
  operationId: "createTaskImageUpload",
  path: "/image-upload/{id}",
  tags: ["Tasks"],
  summary: "Create image upload URL",
  description:
    "Get a presigned URL for uploading an image used in a task description or comment. PUT the bytes to it, then call the finalize route.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: imageUploadBody } },
    },
  },
  responses: {
    200: jsonResponse("The presigned upload", imageUploadSchema),
    400: errorResponse("Unsupported content type, or the file is too large"),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
    503: errorResponse("Image uploads are not configured on this instance"),
  },
});

const finalizeTaskImageUploadRoute = createRoute({
  method: "post",
  operationId: "finalizeTaskImageUpload",
  path: "/image-upload/{id}/finalize",
  tags: ["Tasks"],
  summary: "Finalize image upload",
  description:
    "Record an uploaded image as a private asset and return the URL to reference it by.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: finalizeImageUploadBody } },
    },
  },
  responses: {
    200: jsonResponse("The stored asset", finalizedAssetSchema),
    400: errorResponse(
      "Invalid upload, or the key does not belong to this task",
    ),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
  },
});

const updateTaskDescriptionRoute = createRoute({
  method: "put",
  operationId: "updateTaskDescription",
  path: "/description/{id}",
  tags: ["Tasks"],
  summary: "Update task description",
  description: "Replace a task's description.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateDescriptionBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body, or unknown task"),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
  },
});

const descriptionPageRoute = createRoute({
  method: "get",
  operationId: "getTaskDescriptionPage",
  path: "/{id}/description",
  tags: ["Tasks"],
  summary: "Read a description page",
  middleware: [workspaceAccess.fromTaskId("id")] as const,
  request: { params: taskParam, query: descriptionPageQuery },
  responses: {
    200: jsonResponse("Description page", descriptionPageSchema),
    400: errorResponse("Invalid offset or version"),
    403: errorResponse("No workspace access"),
    404: errorResponse("Task not found"),
    409: errorResponse("Description changed; reload from offset zero"),
    503: errorResponse("Description request timed out"),
  },
});
const descriptionMatchesRoute = createRoute({
  method: "get",
  operationId: "findDeferredTaskDescriptions",
  path: "/description-matches/{projectId}",
  tags: ["Tasks"],
  summary: "Search descriptions omitted from task lists",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam, query: descriptionMatchesQuery },
  responses: {
    200: jsonResponse("Matching task IDs", descriptionMatchesSchema),
    400: errorResponse("Invalid search query or cursor"),
    403: errorResponse("No workspace access"),
    503: errorResponse("Description search timed out"),
  },
});

const claimTaskRoute = createRoute({
  method: "post",
  operationId: "claimTask",
  path: "/claim/{id}",
  tags: ["Tasks"],
  summary: "Claim a task",
  description: "Atomically claim an unassigned to-do task for the current user",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: { params: taskParam },
  responses: {
    200: jsonResponse("Task claimed successfully", claimResultSchema),
    409: errorResponse("Task is not available for claiming"),
  },
});

const claimNextTaskRoute = createRoute({
  method: "post",
  operationId: "claimNextTask",
  path: "/claim-next",
  tags: ["Tasks"],
  summary: "Claim the next available task",
  description:
    "Find and atomically claim the best available to-do task across the caller's team projects",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: claimNextBody } },
    },
  },
  responses: {
    200: jsonResponse("Task claimed successfully", claimResultSchema),
    404: errorResponse("No unclaimed tasks available"),
  },
});

const pauseTaskRoute = createRoute({
  method: "post",
  operationId: "pauseTask",
  path: "/pause/{id}",
  tags: ["Tasks"],
  summary: "Pause a claimed task",
  description: "Pause a task claimed by the current user, with a reason",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: pauseTaskBody } },
    },
  },
  responses: {
    200: jsonResponse("Task paused successfully", taskSchema),
    403: errorResponse("Task not claimed by you"),
  },
});

const resumeTaskRoute = createRoute({
  method: "post",
  operationId: "resumeTask",
  path: "/resume/{id}",
  tags: ["Tasks"],
  summary: "Resume a paused task",
  description: "Resume a paused task claimed by the current user",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: { params: taskParam },
  responses: {
    200: jsonResponse("Task resumed successfully", taskSchema),
  },
});

const releaseTaskRoute = createRoute({
  method: "post",
  operationId: "releaseTask",
  path: "/release/{id}",
  tags: ["Tasks"],
  summary: "Release a claimed task",
  description:
    "Release a task claimed by the current user back to the to-do pool",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: { params: taskParam },
  responses: {
    200: jsonResponse("Task released successfully", taskSchema),
  },
});

const task = apiRouter<BaseVariables & { teamId: string }>()
  .openapi(descriptionPageRoute, async (c) =>
    c.json(
      await getDescriptionPage(c.req.valid("param").id, c.req.valid("query")),
      200,
    ),
  )
  .openapi(descriptionMatchesRoute, async (c) => {
    const { query, after } = c.req.valid("query");
    return c.json(
      await getDeferredDescriptionMatches(
        c.req.valid("param").projectId,
        query,
        after,
      ),
      200,
    );
  })
  .openapi(listTasksRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const filters = c.req.valid("query") || {};

    const tasks = await getTasks(projectId, filters);

    return c.json(tasks, 200);
  })
  .openapi(claimTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const userId = c.get("userId");
    const apiKey = c.get("apiKey");

    const result = await claimTask({
      taskId: id,
      userId,
      agentKeyId: apiKey?.id,
      agentRole: apiKey?.agentRole,
    });

    return c.json(result, 200);
  })
  .openapi(claimNextTaskRoute, async (c) => {
    const userId = c.get("userId");
    const apiKey = c.get("apiKey");
    const body = c.req.valid("json");

    // The explicit requiredRole parameter may only narrow candidates: a
    // caller cannot pass a role they themselves do not hold.
    const requestedRole = body.requiredRole as AgentRole | undefined;
    const agentRole = apiKey?.agentRole;
    const effectiveRole =
      requestedRole && (!agentRole || requestedRole === agentRole)
        ? requestedRole
        : agentRole;

    // A project-bound API key is pinned to its project: inject the binding
    // when no projectId was passed and reject a mismatched explicit one.
    const boundProjectId = apiKey?.projectId ?? null;
    if (boundProjectId && body.projectId && body.projectId !== boundProjectId) {
      throw new HTTPException(403, {
        message: "This API key is bound to a different project.",
      });
    }

    const result = await claimNextTask({
      userId,
      agentKeyId: apiKey?.id,
      projectId: boundProjectId ?? body.projectId,
      priorities: body.priorities,
      agentRole: effectiveRole,
    });

    if (!result) {
      throw new HTTPException(404, {
        message: "No unclaimed tasks available",
      });
    }

    return c.json(result, 200);
  })
  .openapi(pauseTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await pauseTask({
      taskId: id,
      reason,
      currentUserId,
    });

    return c.json(task, 200);
  })
  .openapi(resumeTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const currentUserId = c.get("userId");

    const task = await resumeTask({
      taskId: id,
      currentUserId,
    });

    return c.json(task, 200);
  })
  .openapi(releaseTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const currentUserId = c.get("userId");
    const apiKey = c.get("apiKey");

    const task = await releaseTask({
      taskId: id,
      currentUserId,
      agentRole: apiKey?.agentRole,
      agentKeyId: apiKey?.id,
    });

    return c.json(task, 200);
  })
  .openapi(bulkUpdateTasksRoute, async (c) => {
    const { taskIds, operation, value } = c.req.valid("json");
    const userId = c.get("userId");

    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    if (
      operation !== "delete" &&
      operation !== "updateDueDate" &&
      value === undefined
    ) {
      throw new HTTPException(400, {
        message: "Value is required for this operation",
      });
    }

    const result = await bulkUpdateTasks({
      taskIds,
      operation,
      value,
      userId,
    });

    return c.json(result, 200);
  })
  .openapi(createTaskRoute, async (c) => {
    const { projectId } = c.req.param();
    const {
      title,
      description,
      startDate,
      dueDate,
      priority,
      status,
      userId,
      requiredRole,
      customFields,
    } = c.req.valid("json");

    const parsedStartDate =
      startDate !== undefined
        ? validateAndParseDate(startDate, "startDate")
        : undefined;
    const parsedDueDate =
      dueDate !== undefined
        ? validateAndParseDate(dueDate, "dueDate")
        : undefined;

    validateDateRange(parsedStartDate, parsedDueDate);

    const apiKey = c.get("apiKey");
    // Agent-created tasks must carry an Acceptance Criteria section so the
    // executing agent and the reviewer share an objective done-condition.
    // Human session callers are prompted but not blocked (see design.md).
    if (apiKey && description && !descHasAcceptanceCriteria(description)) {
      throw new HTTPException(400, {
        message:
          "description must include an 'Acceptance Criteria' (or 验收标准) section",
      });
    }

    const task = await createTask({
      projectId,
      currentUserId: c.get("userId"),
      userId: userId,
      title,
      description,
      startDate: parsedStartDate,
      dueDate: parsedDueDate,
      priority,
      status,
      customFields,
      requiredRole: requiredRole ?? null,
      agentRole: apiKey?.agentRole,
    });

    return c.json(task, 200);
  })
  .openapi(getTaskRoute, async (c) => {
    const { id } = c.req.valid("param");

    const task = await getTask(id);

    return c.json(task, 200);
  })
  .openapi(moveTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { destinationProjectId, destinationStatus } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const result = await moveTask({
      taskId: id,
      destinationProjectId,
      destinationStatus,
      currentUserId,
    });

    return c.json(result, 200);
  })
  .openapi(updateTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const {
      title,
      description,
      startDate,
      dueDate,
      priority,
      status,
      projectId,
      position,
      userId,
      requiredRole,
    } = c.req.valid("json");

    const currentUserId = c.get("userId");

    const parsedStartDate =
      startDate !== undefined
        ? validateAndParseDate(startDate, "startDate")
        : undefined;
    const parsedDueDate =
      dueDate !== undefined
        ? validateAndParseDate(dueDate, "dueDate")
        : undefined;

    validateDateRange(parsedStartDate, parsedDueDate);

    const task = await updateTask(
      id,
      title,
      status,
      parsedStartDate,
      parsedDueDate,
      projectId,
      description,
      priority,
      position,
      userId,
      currentUserId,
      requiredRole,
    );

    return c.json(task, 200);
  })
  .openapi(exportTasksRoute, async (c) => {
    const { projectId } = c.req.valid("param");

    const exportData = await exportTasks(projectId);

    return c.json(exportData, 200);
  })
  .openapi(importTasksRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const { tasks } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const result = await importTasks(projectId, tasks, currentUserId);

    return c.json(result, 200);
  })
  .openapi(deleteTaskRoute, async (c) => {
    const { id } = c.req.valid("param");

    const currentUserId = c.get("userId");
    const task = await deleteTask(id, currentUserId);

    return c.json(task, 200);
  })
  .openapi(updateTaskStatusRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const currentUserId = c.get("userId");
    const apiKey = c.get("apiKey");

    const task = await updateTaskStatus({
      id,
      status,
      currentUserId,
      agentRole: apiKey?.agentRole,
      agentKeyId: apiKey?.id,
    });

    return c.json(task, 200);
  })
  .openapi(updateTaskPriorityRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { priority } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskPriority({ id, priority, currentUserId });

    return c.json(task, 200);
  })
  .openapi(updateTaskAssigneeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { userId } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskAssignee({ id, userId, currentUserId });

    return c.json(task, 200);
  })
  .openapi(updateTaskDueDateRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { dueDate = null } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskDueDate({
      id,
      dueDate: dueDate ? validateAndParseDate(dueDate, "dueDate") : null,
      currentUserId,
    });

    return c.json(task, 200);
  })
  .openapi(updateTaskTitleRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { title } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskTitle({ id, title, currentUserId });

    return c.json(task, 200);
  })
  .openapi(createTaskImageUploadRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { filename, contentType, size, surface } = c.req.valid("json");

    try {
      validateTaskAssetUploadInput(contentType, size);
    } catch (error) {
      throw new HTTPException(400, {
        message:
          error instanceof Error
            ? error.message
            : "Invalid image upload request",
      });
    }

    const [taskContext] = await db
      .select({
        taskId: taskTable.id,
        projectId: taskTable.projectId,
        teamId: projectTable.teamId,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(eq(taskTable.id, id))
      .limit(1);

    if (!taskContext) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    try {
      const upload = await createTaskImageUploadUrl({
        teamId: taskContext.teamId,
        projectId: taskContext.projectId,
        taskId: taskContext.taskId,
        surface,
        filename,
        contentType,
        size,
      });

      return c.json(upload, 200);
    } catch (error) {
      throw new HTTPException(503, {
        message:
          error instanceof Error
            ? error.message
            : "Image uploads are not configured",
      });
    }
  })
  .openapi(finalizeTaskImageUploadRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { key, filename, contentType, size, surface } = c.req.valid("json");
    const userId = c.get("userId");

    try {
      validateTaskAssetUploadInput(contentType, size);
    } catch (error) {
      throw new HTTPException(400, {
        message:
          error instanceof Error
            ? error.message
            : "Invalid image upload request",
      });
    }

    const [taskContext] = await db
      .select({
        taskId: taskTable.id,
        projectId: taskTable.projectId,
        teamId: projectTable.teamId,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(eq(taskTable.id, id))
      .limit(1);

    if (!taskContext) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    const normalizedKey = key.trim();
    if (
      !assertTaskImageKeyMatchesContext(normalizedKey, {
        teamId: taskContext.teamId,
        projectId: taskContext.projectId,
        taskId: taskContext.taskId,
        surface,
      })
    ) {
      throw new HTTPException(400, {
        message: "Image upload key does not match the task context.",
      });
    }

    let uploaded: Awaited<ReturnType<typeof verifyTaskAssetUpload>>;
    try {
      uploaded = await verifyTaskAssetUpload(normalizedKey, {
        size,
        contentType,
      });
    } catch (error) {
      throw new HTTPException(
        error instanceof InvalidUploadedAssetError ? 400 : 503,
        {
          message:
            error instanceof InvalidUploadedAssetError
              ? error.message
              : "Unable to verify uploaded object.",
        },
      );
    }

    const [existingAsset] = await db
      .select({ id: assetTable.id })
      .from(assetTable)
      .where(eq(assetTable.objectKey, normalizedKey))
      .limit(1);

    const [asset] = existingAsset
      ? await db
          .update(assetTable)
          .set({
            teamId: taskContext.teamId,
            projectId: taskContext.projectId,
            taskId: taskContext.taskId,
            filename,
            mimeType: uploaded.contentType,
            size: uploaded.size,
            kind: isImageContentType(uploaded.contentType)
              ? "image"
              : "attachment",
            surface,
            createdBy: userId || null,
          })
          .where(eq(assetTable.id, existingAsset.id))
          .returning({
            id: assetTable.id,
          })
      : await db
          .insert(assetTable)
          .values({
            teamId: taskContext.teamId,
            projectId: taskContext.projectId,
            taskId: taskContext.taskId,
            objectKey: normalizedKey,
            filename,
            mimeType: uploaded.contentType,
            size: uploaded.size,
            kind: isImageContentType(uploaded.contentType)
              ? "image"
              : "attachment",
            surface,
            createdBy: userId || null,
          })
          .returning({
            id: assetTable.id,
          });

    if (!asset) {
      throw new HTTPException(500, {
        message: "Failed to save asset",
      });
    }

    const apiBaseUrl = normalizeApiServerUrl(
      process.env.KANEO_API_URL || new URL(c.req.url).origin,
    );
    return c.json(
      {
        id: asset.id,
        url: `${apiBaseUrl}/asset/${asset.id}`,
      },
      200,
    );
  })
  .openapi(updateTaskDescriptionRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { description } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskDescription({
      id,
      description,
      currentUserId,
    });

    return c.json(task, 200);
  });

export default task;

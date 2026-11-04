import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { encodeCustomFieldValue } from "../kaneo/custom-field-value.js";
import { buildFullTaskUpdateBody } from "../kaneo/task-helpers.js";
import { errorResult, textResult } from "../utils/mcp-result.js";
import { getCurrentUser } from "./get-current-user.js";

export type ToolClient = {
  readonly usingApiKey?: boolean;
  json<T = unknown>(path: string, init?: RequestInit): Promise<T>;
};
export type ToolRegistrar = {
  registerTool(
    name: string,
    config: { description: string; inputSchema: z.ZodObject },
    callback: (args: unknown) => Promise<CallToolResult>,
  ): unknown;
};

const prioritySchema = z.enum([
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
]);

const agentRoleSchema = z
  .enum([
    "coding",
    "product-design",
    "architecture-design",
    "devops",
    "ui-design",
    "testing",
    "code-review",
  ])
  .describe(
    "Agent role the task should be claimed by. Generic tasks (omit the role) are claimable by any agent.",
  );

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const nullableOptionalNonEmptyString = nonEmptyString.nullable().optional();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const optionalIsoDateTimeSchema = isoDateTimeSchema.optional();
const nullableOptionalIsoDateTimeSchema = isoDateTimeSchema
  .nullable()
  .optional();
const hexColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Expected a hex color like #FF6600",
  );

function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  return fn()
    .then((data) => textResult(data))
    .catch((e: unknown) =>
      errorResult(e instanceof Error ? e.message : String(e)),
    );
}

export function registerTools(
  server: ToolRegistrar,
  ctx: { client: ToolClient },
): void {
  const { client } = ctx;
  const registerTool = <S extends z.ZodObject>(
    name: string,
    config: { description: string; inputSchema: S },
    callback: (args: z.output<S>) => Promise<CallToolResult>,
  ) =>
    server.registerTool(name, config, async (args) => {
      const parsed = config.inputSchema.safeParse(args);
      if (!parsed.success) return errorResult(z.prettifyError(parsed.error));
      return callback(parsed.data);
    });

  registerTool(
    "whoami",
    {
      description:
        "Return the current Kaneo user for the configured authentication method.",
      inputSchema: z.object({}),
    },
    async () => run(() => getCurrentUser(client)),
  );

  registerTool(
    "list_workspaces",
    {
      description: "List teams the signed-in user can access.",
      inputSchema: z.object({}),
    },
    async () => run(() => client.json("/api/team", { method: "GET" })),
  );

  registerTool(
    "list_projects",
    {
      description: "List projects in a team.",
      inputSchema: z.object({
        workspaceId: nonEmptyString.describe("Team ID"),
        includeArchived: z
          .boolean()
          .optional()
          .describe("Include archived projects"),
      }),
    },
    async (args) => {
      const { workspaceId, includeArchived } = args;
      // workspaceId is a back-compat alias for the team id.
      const qs = new URLSearchParams({ teamId: workspaceId });
      if (includeArchived === true) {
        qs.set("includeArchived", "true");
      }
      return run(() =>
        client.json(`/api/project?${qs.toString()}`, { method: "GET" }),
      );
    },
  );

  registerTool(
    "get_project",
    {
      description: "Get a single project by ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() => client.json(`/api/project/${encodeURIComponent(args.id)}`)),
  );

  registerTool(
    "create_project",
    {
      description: "Create a project in a team.",
      inputSchema: z.object({
        name: nonEmptyString,
        workspaceId: nonEmptyString,
        icon: nonEmptyString,
        slug: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/project", {
          method: "POST",
          body: JSON.stringify({
            name: args.name,
            teamId: args.workspaceId,
            icon: args.icon,
            slug: args.slug,
          }),
        }),
      ),
  );

  registerTool(
    "update_project",
    {
      description:
        "Update project metadata (PATCH-style: only provided fields are changed).",
      inputSchema: z.object({
        id: nonEmptyString,
        name: optionalNonEmptyString,
        icon: z.string().optional(),
        slug: optionalNonEmptyString,
        description: z.string().optional(),
        isPublic: z.boolean().optional(),
      }),
    },
    async (args) => {
      const { id, ...patch } = args;
      return run(async () => {
        const existing = (await client.json(
          `/api/project/${encodeURIComponent(id)}`,
          { method: "GET" },
        )) as Record<string, unknown>;
        const name =
          patch.name ??
          (typeof existing.name === "string" ? existing.name : "");
        if (!name) {
          throw new Error("Cannot update project: missing name.");
        }
        const icon =
          patch.icon !== undefined
            ? patch.icon
            : typeof existing.icon === "string"
              ? existing.icon
              : "Layout";
        const slug =
          patch.slug ??
          (typeof existing.slug === "string" ? existing.slug : "");
        if (!slug) {
          throw new Error("Cannot update project: missing slug.");
        }
        const description =
          patch.description !== undefined
            ? patch.description
            : typeof existing.description === "string"
              ? existing.description
              : "";
        const isPublic =
          patch.isPublic !== undefined
            ? patch.isPublic
            : typeof existing.isPublic === "boolean"
              ? existing.isPublic
              : false;

        const body = { name, icon, slug, description, isPublic };

        return client.json(`/api/project/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      });
    },
  );

  const listTasksSchema = z.object({
    projectId: nonEmptyString,
    status: optionalNonEmptyString,
    priority: prioritySchema.optional(),
    assigneeId: optionalNonEmptyString,
    page: z.number().int().min(1).max(1_000_000).optional(),
    relatedPage: z.number().int().min(1).max(1_000_000).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    sortBy: z
      .enum(["createdAt", "priority", "dueDate", "position", "title", "number"])
      .optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    dueBefore: optionalIsoDateTimeSchema,
    dueAfter: optionalIsoDateTimeSchema,
  });

  registerTool(
    "list_tasks",
    {
      description:
        "List a bounded page of tasks for a project (50 by default, maximum 100). Use pagination.totalPages and page to retrieve the rest; filters and sorting apply before pagination. For every task page, also follow relatedPage through pagination.relatedTotalPages for complete labels, links and column metadata. Custom field values are not included; use get_task_custom_field_values.",
      inputSchema: listTasksSchema,
    },
    async (args) => {
      const { projectId, ...rest } = args;
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(rest)) {
        if (v === undefined || v === null) {
          continue;
        }
        qs.set(k, String(v));
      }
      const q = qs.toString();
      const path = `/api/task/tasks/${encodeURIComponent(projectId)}${q ? `?${q}` : ""}`;
      return run(() => client.json(path, { method: "GET" }));
    },
  );

  registerTool(
    "get_task",
    {
      description:
        "Get a task by ID. Custom field values are not included; use get_task_custom_field_values.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
    "get_task_by_ticket_id",
    {
      description:
        "Get one task by its ticket ID (project key and number, e.g. KAN-12). If multiple accessible tasks share the ID, provide workspaceId (team id) or projectId.",
      inputSchema: z.object({
        ticketId: nonEmptyString,
        workspaceId: optionalNonEmptyString,
        projectId: optionalNonEmptyString,
      }),
    },
    async ({ ticketId, workspaceId, projectId }) => {
      const query = new URLSearchParams();
      // workspaceId is a back-compat alias for the team id.
      if (workspaceId) query.set("teamId", workspaceId);
      if (projectId) query.set("projectId", projectId);
      const suffix = query.toString();
      return run(() =>
        client.json(
          `/api/task/by-ticket-id/${encodeURIComponent(ticketId)}${suffix ? `?${suffix}` : ""}`,
          { method: "GET" },
        ),
      );
    },
  );

  registerTool(
    "create_task",
    {
      description:
        "Create a task in a project.\n\n" +
        "Title: plain-English and human-readable (>=8 chars); never a branch name, ticket id, or SHA. Put urgency in priority and the executing role in requiredRole, not in the title.\n" +
        "Description: inline the essential context with Markdown sections (## Context, ## Acceptance Criteria, ## Out of Scope). The description MUST contain an 'Acceptance Criteria' (or 验收标准) section.\n" +
        'startDate/dueDate: ALWAYS schedule the task (ISO 8601, e.g. "2025-01-15"). Estimate dates from task size, priority, and dependencies; start from today when nothing else is known. Tasks without dates do not appear on the Gantt chart. A blocked or subordinate task must start on or after its blocker\'s dueDate. Effort over ~3 days should be split into a parent with subtasks.\n' +
        "relations: ALWAYS declare the relation when this task was spawned from another one (a prerequisite it unblocks, or a follow-up it produces). The API creates the task and its relations in one transaction, so a rejected relation creates no task.",
      inputSchema: z.object({
        projectId: nonEmptyString,
        title: nonEmptyString,
        description: z.string(),
        priority: prioritySchema,
        status: nonEmptyString,
        startDate: optionalIsoDateTimeSchema,
        dueDate: optionalIsoDateTimeSchema,
        userId: optionalNonEmptyString,
        requiredRole: agentRoleSchema.optional(),
        relations: z
          .array(
            z.object({
              targetTaskId: nonEmptyString,
              relationType: z.enum(["subtask", "blocks", "related"]),
            }),
          )
          .optional(),
      }),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        title: args.title,
        description: args.description,
        priority: args.priority,
        status: args.status,
      };
      if (args.startDate !== undefined) {
        body.startDate = args.startDate;
      }
      if (args.dueDate !== undefined) {
        body.dueDate = args.dueDate;
      }
      if (args.userId !== undefined) {
        body.userId = args.userId;
      }
      if (args.requiredRole !== undefined) {
        body.requiredRole = args.requiredRole;
      }
      if (args.relations !== undefined) {
        body.relations = args.relations;
      }
      return run(() =>
        client.json(`/api/task/${encodeURIComponent(args.projectId)}`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    },
  );

  registerTool(
    "duplicate_task",
    {
      description:
        "Duplicate a task in the same project, copying its fields and labels. Pass title to rename the copy.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        title: optionalNonEmptyString,
      }),
    },
    async (args) => {
      const body: Record<string, string> = {};
      if (args.title !== undefined) {
        body.title = args.title;
      }
      return run(() =>
        client.json(`/api/task/duplicate/${encodeURIComponent(args.taskId)}`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    },
  );

  const updateTaskSchema = z.object({
    taskId: nonEmptyString,
    title: optionalNonEmptyString,
    description: z.string().nullable().optional(),
    status: optionalNonEmptyString,
    priority: prioritySchema.optional(),
    projectId: optionalNonEmptyString,
    position: z.number().optional(),
    startDate: nullableOptionalIsoDateTimeSchema,
    dueDate: nullableOptionalIsoDateTimeSchema,
    userId: nullableOptionalNonEmptyString,
  });

  registerTool(
    "update_task",
    {
      description:
        "Update a task (fetches current task, merges fields, then full update).",
      inputSchema: updateTaskSchema,
    },
    async (args) => {
      const { taskId, ...patch } = args;
      return run(async () => {
        const existing = (await client.json(
          `/api/task/${encodeURIComponent(taskId)}`,
          { method: "GET" },
        )) as Record<string, unknown>;
        const body = buildFullTaskUpdateBody(existing, patch);
        return client.json(`/api/task/${encodeURIComponent(taskId)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      });
    },
  );

  registerTool(
    "move_task",
    {
      description:
        "Move a task to another project (and optional column status).",
      inputSchema: z.object({
        taskId: nonEmptyString,
        destinationProjectId: nonEmptyString,
        destinationStatus: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/move/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({
            destinationProjectId: args.destinationProjectId,
            ...(args.destinationStatus !== undefined
              ? { destinationStatus: args.destinationStatus }
              : {}),
          }),
        }),
      ),
  );

  registerTool(
    "update_task_status",
    {
      description:
        "Update only the status (column) of a task. Setting 'paused' requires pausedReason so the paused column stays actionable; prefer pause_task when you also want the task recorded as claimed by you.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        status: nonEmptyString,
        pausedReason: z
          .string()
          .optional()
          .describe("Required when status is 'paused'."),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/status/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({
            status: args.status,
            ...(args.pausedReason !== undefined
              ? { pausedReason: args.pausedReason }
              : {}),
          }),
        }),
      ),
  );

  registerTool(
    "list_task_comments",
    {
      description: "List comments on a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
    "create_task_comment",
    {
      description: "Add a comment to a task.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        content: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.taskId)}`, {
          method: "POST",
          body: JSON.stringify({ content: args.content }),
        }),
      ),
  );

  registerTool(
    "update_task_comment",
    {
      description: "Update one of your comments on a task.",
      inputSchema: z.object({
        commentId: nonEmptyString,
        content: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.commentId)}`, {
          method: "PUT",
          body: JSON.stringify({ content: args.content }),
        }),
      ),
  );

  registerTool(
    "delete_task_comment",
    {
      description: "Delete one of your comments from a task.",
      inputSchema: z.object({ commentId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.commentId)}`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "list_workspace_labels",
    {
      description: "List labels defined in a team.",
      inputSchema: z.object({ workspaceId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/label/team/${encodeURIComponent(args.workspaceId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
    "create_label",
    {
      description: "Create a label in a team (optionally attach to a task).",
      inputSchema: z.object({
        name: nonEmptyString,
        color: hexColorSchema,
        workspaceId: nonEmptyString,
        taskId: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/label", {
          method: "POST",
          body: JSON.stringify({
            name: args.name,
            color: args.color,
            teamId: args.workspaceId,
            ...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "attach_label_to_task",
    {
      description: "Attach an existing label to a task.",
      inputSchema: z.object({
        labelId: nonEmptyString,
        taskId: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/label/${encodeURIComponent(args.labelId)}/task`, {
          method: "PUT",
          body: JSON.stringify({ taskId: args.taskId }),
        }),
      ),
  );

  registerTool(
    "detach_label_from_task",
    {
      description: "Detach a label from its current task.",
      inputSchema: z.object({ labelId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/label/${encodeURIComponent(args.labelId)}/task`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "create_task_relation",
    {
      description:
        "Create a relation between two tasks. relationType: 'subtask' (sourceTaskId is the parent, targetTaskId the child), 'blocks' (sourceTaskId blocks targetTaskId), or 'related' (bidirectional).",
      inputSchema: z.object({
        sourceTaskId: nonEmptyString,
        targetTaskId: nonEmptyString,
        relationType: z.enum(["subtask", "blocks", "related"]),
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/task-relation", {
          method: "POST",
          body: JSON.stringify({
            sourceTaskId: args.sourceTaskId,
            targetTaskId: args.targetTaskId,
            relationType: args.relationType,
          }),
        }),
      ),
  );

  registerTool(
    "get_task_relations",
    {
      description:
        "List all relations (subtask/blocks/related) involving a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-relation/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
    "delete_task_relation",
    {
      description: "Delete a task relation by its relation ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-relation/${encodeURIComponent(args.id)}`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "delete_label",
    {
      description:
        "Delete a task or team label by ID. Large team-label cascades resume automatically; repeat the tool if pendingDeletion remains true.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(async () => {
        let result: unknown;
        const signal = AbortSignal.timeout(10_000);
        // Bound work per tool call. The API persists the continuation boundary.
        for (let page = 0; page < 100; page++) {
          if (page > 0 && signal.aborted) break;
          try {
            result = await client.json(
              `/api/label/${encodeURIComponent(args.id)}`,
              { method: "DELETE", signal },
            );
          } catch (error) {
            if (signal.aborted && result) break;
            throw error;
          }
          if (
            !result ||
            typeof result !== "object" ||
            !("pendingDeletion" in result) ||
            !result.pendingDeletion
          )
            break;
        }
        return result;
      }),
  );

  registerTool(
    "list_workspace_members",
    {
      description:
        "List the members of a team. Use this to resolve the user ID an assignee tool expects.",
      inputSchema: z.object({ workspaceId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/team/${encodeURIComponent(args.workspaceId)}/members`,
        ),
      ),
  );

  registerTool(
    "search",
    {
      description:
        "Search across tasks, projects, teams, comments, and activities.",
      inputSchema: z.object({
        q: nonEmptyString.describe("Search query"),
        type: z
          .enum(["all", "tasks", "projects", "teams", "comments", "activities"])
          .optional()
          .describe("Restrict results to one kind. Defaults to all."),
        workspaceId: optionalNonEmptyString.describe("Limit to one team"),
        projectId: optionalNonEmptyString.describe("Limit to one project"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum results, 1 to 50. Defaults to 20."),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams({ q: args.q });
      if (args.type) qs.set("type", args.type);
      if (args.workspaceId) qs.set("teamId", args.workspaceId);
      if (args.projectId) qs.set("projectId", args.projectId);
      if (args.limit !== undefined) qs.set("limit", String(args.limit));
      return run(() => client.json(`/api/search?${qs.toString()}`));
    },
  );

  registerTool(
    "list_project_columns",
    {
      description:
        "List a project's columns. Their slugs are the values update_task_status and create_task accept as a status.",
      inputSchema: z.object({ projectId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/column/${encodeURIComponent(args.projectId)}`),
      ),
  );

  registerTool(
    "list_project_custom_fields",
    {
      description:
        "List a project's custom field definitions: id, name, type (text, number, date, dropdown, boolean, multiselect), required, options, and defaultValue.",
      inputSchema: z.object({ projectId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/custom-field/project/${encodeURIComponent(args.projectId)}`,
        ),
      ),
  );

  registerTool(
    "get_task_custom_field_values",
    {
      description:
        "List a task's custom field values with each field's name, type, and options. Fields without a value are omitted. Multiselect values are JSON array strings.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/custom-field/task/${encodeURIComponent(args.taskId)}`,
        ),
      ),
  );

  registerTool(
    "set_task_custom_field_value",
    {
      description:
        "Set or clear one custom field value on a task. Get fieldId from list_project_custom_fields. Pass dates as YYYY-MM-DD, a dropdown value as one of its options, multiselect values as an array of options, and null to clear the value (required fields can't be cleared).",
      inputSchema: z.object({
        taskId: nonEmptyString,
        fieldId: nonEmptyString,
        value: z
          .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
          .nullable()
          .describe("New value, or null to clear it"),
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/custom-field/value", {
          method: "PUT",
          body: JSON.stringify({
            taskId: args.taskId,
            fieldId: args.fieldId,
            value: encodeCustomFieldValue(args.value),
          }),
        }),
      ),
  );

  registerTool(
    "delete_task",
    {
      description: "Delete a task by ID.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/${encodeURIComponent(args.taskId)}`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "update_task_assignee",
    {
      description:
        "Assign a task to a team member, or pass a null userId to unassign it.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        userId: nonEmptyString
          .nullable()
          .describe("Member user ID, or null to unassign"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/assignee/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ userId: args.userId }),
        }),
      ),
  );

  registerTool(
    "update_task_due_date",
    {
      description: "Set a task's due date. Omit dueDate to clear it.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        dueDate: optionalIsoDateTimeSchema,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/due-date/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify(
            args.dueDate === undefined ? {} : { dueDate: args.dueDate },
          ),
        }),
      ),
  );

  registerTool(
    "update_task_recurrence",
    {
      description:
        "Make a task repeat, or omit frequency to stop it repeating. When a repeating task moves into a final column, the next task is created in the first open column, due one step after the completed task's due date.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).optional(),
        interval: z.number().int().min(1).max(99).default(1),
        weekdays: z
          .array(z.number().int().min(0).max(6))
          .min(1)
          .max(7)
          .optional()
          .describe(
            "Weekly only: days to repeat on, 0 for Sunday to 6 for Saturday.",
          ),
        timeZone: nonEmptyString
          .optional()
          .describe(
            "Required with frequency: the user's IANA time zone, such as Europe/Madrid. Weekdays and month ends are matched in this zone, so a wrong one moves the next task to another local day.",
          ),
      }),
    },
    async (args) => {
      if (args.frequency && !args.timeZone)
        return errorResult("timeZone is required with frequency");
      return run(() =>
        client.json(`/api/task/recurrence/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({
            recurrence: args.frequency
              ? {
                  frequency: args.frequency,
                  interval: args.interval,
                  ...(args.weekdays ? { weekdays: args.weekdays } : {}),
                  timeZone: args.timeZone,
                }
              : null,
          }),
        }),
      );
    },
  );

  registerTool(
    "list_task_time_entries",
    {
      description: "List the time entries logged against a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/time-entry/task/${encodeURIComponent(args.taskId)}`),
      ),
  );

  registerTool(
    "get_time_entry",
    {
      description: "Get a single time entry by ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() => client.json(`/api/time-entry/${encodeURIComponent(args.id)}`)),
  );

  registerTool(
    "create_time_entry",
    {
      description:
        "Log time against a task. Omit endTime to leave the entry running.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        startTime: isoDateTimeSchema,
        endTime: optionalIsoDateTimeSchema,
        description: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/time-entry", {
          method: "POST",
          body: JSON.stringify({
            taskId: args.taskId,
            startTime: args.startTime,
            ...(args.endTime ? { endTime: args.endTime } : {}),
            ...(args.description ? { description: args.description } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "update_time_entry",
    {
      description:
        "Update a time entry. startTime is required; omitting endTime keeps the stored one. startTime cannot be later than the end time.",
      inputSchema: z.object({
        id: nonEmptyString,
        startTime: isoDateTimeSchema,
        endTime: optionalIsoDateTimeSchema,
        description: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/time-entry/${encodeURIComponent(args.id)}`, {
          method: "PUT",
          body: JSON.stringify({
            startTime: args.startTime,
            ...(args.endTime ? { endTime: args.endTime } : {}),
            ...(args.description ? { description: args.description } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "list_task_activity",
    {
      description: "List a task's activity history.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/activity/${encodeURIComponent(args.taskId)}`),
      ),
  );

  registerTool(
    "list_notifications",
    {
      description: "List the signed-in user's notifications.",
      inputSchema: z.object({}),
    },
    async () => run(() => client.json("/api/notification")),
  );

  // ---------------------------------------------------------------------------
  // VCS integration tools (GitHub / GitLab / Gitea)
  // ---------------------------------------------------------------------------
  const vcsTypeSchema = z
    .enum(["github", "gitlab", "gitea"])
    .describe("The VCS integration type to operate on");
  const vcsProjectId = nonEmptyString.describe(
    "Kaneo project ID whose active integration should be used",
  );
  const vcsIssueNumber = z
    .number()
    .int()
    .positive()
    .describe("Issue number in the configured repository");
  const vcsStateSchema = z
    .enum(["open", "closed", "all"])
    .optional()
    .describe("Issue state filter (defaults to open)");

  const vcsBasePath = (type: string, projectId: string) =>
    `/api/${type}-integration/vcs/${encodeURIComponent(projectId)}`;

  registerTool(
    "vcs_list_repositories",
    {
      description:
        "List repositories accessible to the project's active VCS integration.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`${vcsBasePath(args.type, args.projectId)}/repositories`),
      ),
  );

  registerTool(
    "vcs_list_issues",
    {
      description:
        "List issues in the configured repository of the project's active VCS integration.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        state: vcsStateSchema,
      }),
    },
    async (args) => {
      const qs = args.state ? `?state=${args.state}` : "";
      return run(() =>
        client.json(`${vcsBasePath(args.type, args.projectId)}/issues${qs}`),
      );
    },
  );

  registerTool(
    "vcs_get_issue",
    {
      description:
        "Get a single issue by number from the configured repository.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        number: vcsIssueNumber,
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${vcsBasePath(args.type, args.projectId)}/issues/${args.number}`,
        ),
      ),
  );

  registerTool(
    "vcs_list_issue_comments",
    {
      description: "List comments on an issue in the configured repository.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        number: vcsIssueNumber,
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${vcsBasePath(args.type, args.projectId)}/issues/${args.number}/comments`,
        ),
      ),
  );

  registerTool(
    "vcs_list_pull_requests",
    {
      description:
        "List open pull requests in the configured repository of the project's active VCS integration.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`${vcsBasePath(args.type, args.projectId)}/pull-requests`),
      ),
  );

  registerTool(
    "vcs_list_labels",
    {
      description: "List labels defined in the configured repository.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`${vcsBasePath(args.type, args.projectId)}/labels`),
      ),
  );

  registerTool(
    "vcs_create_issue",
    {
      description: "Create an issue in the configured repository.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        title: nonEmptyString.describe("Issue title"),
        body: z.string().optional().describe("Issue body"),
        closed: z.boolean().optional().describe("Create the issue as closed"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`${vcsBasePath(args.type, args.projectId)}/issues`, {
          method: "POST",
          body: JSON.stringify({
            title: args.title,
            ...(args.body !== undefined ? { body: args.body } : {}),
            ...(args.closed !== undefined ? { closed: args.closed } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "vcs_update_issue",
    {
      description:
        "Update an issue in the configured repository (title, body, or state).",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        number: vcsIssueNumber,
        title: z.string().optional().describe("New issue title"),
        body: z.string().nullable().optional().describe("New issue body"),
        state: z
          .enum(["open", "closed"])
          .optional()
          .describe("New issue state"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${vcsBasePath(args.type, args.projectId)}/issues/${args.number}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              ...(args.title !== undefined ? { title: args.title } : {}),
              ...(args.body !== undefined ? { body: args.body } : {}),
              ...(args.state !== undefined ? { state: args.state } : {}),
            }),
          },
        ),
      ),
  );

  registerTool(
    "vcs_create_issue_comment",
    {
      description: "Add a comment to an issue in the configured repository.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        number: vcsIssueNumber,
        body: nonEmptyString.describe("Comment body"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${vcsBasePath(args.type, args.projectId)}/issues/${args.number}/comments`,
          {
            method: "POST",
            body: JSON.stringify({ body: args.body }),
          },
        ),
      ),
  );

  registerTool(
    "vcs_create_label",
    {
      description: "Create a label in the configured repository.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        name: nonEmptyString.describe("Label name"),
        color: hexColorSchema.describe("Label color as a hex value"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`${vcsBasePath(args.type, args.projectId)}/labels`, {
          method: "POST",
          body: JSON.stringify({ name: args.name, color: args.color }),
        }),
      ),
  );

  registerTool(
    "vcs_add_labels_to_issue",
    {
      description: "Add labels to an issue in the configured repository.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        number: vcsIssueNumber,
        labelIds: z
          .array(z.number().int().positive())
          .describe("Label IDs to add"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${vcsBasePath(args.type, args.projectId)}/issues/${args.number}/labels`,
          {
            method: "POST",
            body: JSON.stringify({ labelIds: args.labelIds }),
          },
        ),
      ),
  );

  registerTool(
    "vcs_replace_issue_labels",
    {
      description:
        "Replace all labels on an issue in the configured repository with the given set.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        number: vcsIssueNumber,
        labelIds: z
          .array(z.number().int().positive())
          .describe("Label IDs to set on the issue"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${vcsBasePath(args.type, args.projectId)}/issues/${args.number}/labels`,
          {
            method: "PUT",
            body: JSON.stringify({ labelIds: args.labelIds }),
          },
        ),
      ),
  );

  registerTool(
    "vcs_remove_label_from_issue",
    {
      description: "Remove a label from an issue in the configured repository.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
        number: vcsIssueNumber,
        labelId: z.number().int().positive().describe("Label ID to remove"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `${vcsBasePath(args.type, args.projectId)}/issues/${args.number}/labels`,
          {
            method: "DELETE",
            body: JSON.stringify({ labelId: args.labelId }),
          },
        ),
      ),
  );

  registerTool(
    "vcs_import_issues",
    {
      description:
        "Import issues from the project's active VCS integration into Kaneo tasks.",
      inputSchema: z.object({
        type: vcsTypeSchema,
        projectId: vcsProjectId,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/${args.type}-integration/import-issues`, {
          method: "POST",
          body: JSON.stringify({ projectId: args.projectId }),
        }),
      ),
  );

  // --- Agent working-directory tools ---
  // These mirror the conversation tool set (apps/api/src/chat/tools.ts) and
  // route through the same tool-execute endpoint so both MCP surfaces share
  // the same working-directory sandboxing, clone, and command-gating logic.

  registerTool(
    "agent_clone_repo",
    {
      description:
        "Clone the project's connected version-control repository into the agent working directory. If a clone already exists it is updated (pulled). Use this when asked to read, search, or analyze the project's source code.",
      inputSchema: z.object({
        projectId: nonEmptyString.describe("Project ID"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/chat/project/${encodeURIComponent(args.projectId)}/tool`,
          {
            method: "POST",
            body: JSON.stringify({ tool: "agent_clone_repo", args: {} }),
          },
        ),
      ),
  );

  registerTool(
    "agent_sync_project",
    {
      description:
        "Synchronize the working directory with the project's Kaneo context and code repository. Call this FIRST when the workdir state is unknown: with no project info present it clones the connected repository and writes kaneo-context.json plus KANEO_CONTEXT.md; with existing project info it only fast-forwards when the repository has new commits and reports 'aligned' otherwise. Returns the sync mode (cloned / aligned / context-only) and the project context bundle. Never returns credentials.",
      inputSchema: z.object({
        projectId: nonEmptyString.describe("Project ID"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/chat/project/${encodeURIComponent(args.projectId)}/tool`,
          {
            method: "POST",
            body: JSON.stringify({ tool: "agent_sync_project", args: {} }),
          },
        ),
      ),
  );

  registerTool(
    "agent_list_files",
    {
      description:
        "List files and directories inside the agent working directory (which holds cloned repos and uploaded files).",
      inputSchema: z.object({
        projectId: nonEmptyString.describe("Project ID"),
        path: z
          .string()
          .optional()
          .describe(
            "Relative path inside the working directory (default: root).",
          ),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/chat/project/${encodeURIComponent(args.projectId)}/tool`,
          {
            method: "POST",
            body: JSON.stringify({
              tool: "agent_list_files",
              args: args.path !== undefined ? { path: args.path } : {},
            }),
          },
        ),
      ),
  );

  registerTool(
    "agent_read_file",
    {
      description:
        "Read a text file inside the agent working directory. Optionally pass offset/limit to page large files.",
      inputSchema: z.object({
        projectId: nonEmptyString.describe("Project ID"),
        path: nonEmptyString.describe(
          "Relative file path inside the working directory.",
        ),
        offset: z
          .number()
          .int()
          .optional()
          .describe("Line offset (0-based) for paging."),
        limit: z
          .number()
          .int()
          .optional()
          .describe("Max lines to read from the offset."),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/chat/project/${encodeURIComponent(args.projectId)}/tool`,
          {
            method: "POST",
            body: JSON.stringify({
              tool: "agent_read_file",
              args: {
                path: args.path,
                ...(args.offset !== undefined ? { offset: args.offset } : {}),
                ...(args.limit !== undefined ? { limit: args.limit } : {}),
              },
            }),
          },
        ),
      ),
  );

  registerTool(
    "agent_write_file",
    {
      description:
        "Write or overwrite a text file inside the agent working directory, creating parent directories as needed.",
      inputSchema: z.object({
        projectId: nonEmptyString.describe("Project ID"),
        path: nonEmptyString.describe(
          "Relative file path inside the working directory.",
        ),
        content: nonEmptyString.describe("File content."),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/chat/project/${encodeURIComponent(args.projectId)}/tool`,
          {
            method: "POST",
            body: JSON.stringify({
              tool: "agent_write_file",
              args: { path: args.path, content: args.content },
            }),
          },
        ),
      ),
  );

  registerTool(
    "agent_search_files",
    {
      description:
        "Recursively search the agent working directory by filename and/or content keyword. Returns matching files with line numbers for content matches.",
      inputSchema: z.object({
        projectId: nonEmptyString.describe("Project ID"),
        query: z
          .string()
          .optional()
          .describe("Filename substring to match (optional)."),
        content: z
          .string()
          .optional()
          .describe("Content keyword to search for (optional)."),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/chat/project/${encodeURIComponent(args.projectId)}/tool`,
          {
            method: "POST",
            body: JSON.stringify({
              tool: "agent_search_files",
              args: {
                ...(args.query !== undefined ? { query: args.query } : {}),
                ...(args.content !== undefined
                  ? { content: args.content }
                  : {}),
              },
            }),
          },
        ),
      ),
  );

  registerTool(
    "agent_delete_file",
    {
      description: "Delete a file inside the agent working directory.",
      inputSchema: z.object({
        projectId: nonEmptyString.describe("Project ID"),
        path: nonEmptyString.describe(
          "Relative file path inside the working directory.",
        ),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/chat/project/${encodeURIComponent(args.projectId)}/tool`,
          {
            method: "POST",
            body: JSON.stringify({
              tool: "agent_delete_file",
              args: { path: args.path },
            }),
          },
        ),
      ),
  );

  registerTool(
    "agent_run_command",
    {
      description:
        "Run a shell command with the agent working directory as the working directory. Captures stdout/stderr and exit code. Only available when command execution is enabled.",
      inputSchema: z.object({
        projectId: nonEmptyString.describe("Project ID"),
        command: nonEmptyString.describe("The shell command to run."),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/chat/project/${encodeURIComponent(args.projectId)}/tool`,
          {
            method: "POST",
            body: JSON.stringify({
              tool: "agent_run_command",
              args: { command: args.command },
            }),
          },
        ),
      ),
  );
}

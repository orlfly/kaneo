import { and, eq, inArray } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { assertProjectScope } from "./agent-role";

type TeamIdSource =
  | { type: "query"; key: string }
  | { type: "body"; key: string }
  | { type: "param"; key: string }
  | {
      type: "lookup";
      resource:
        | "project"
        | "task"
        | "label"
        | "timeEntry"
        | "activity"
        | "comment"
        | "column"
        | "workflowRule"
        | "customField";
      idKey: string;
    }
  | {
      type: "lookupMany";
      resource: "task";
      idKey: string;
    };

type TeamAccessMiddlewareConfig = {
  sources: TeamIdSource[];
};

// Resources whose lookup resolves (or is) a project id, so a project-bound
// API key can be checked against it.
const PROJECT_SCOPED_RESOURCES = new Set(["project", "task"]);

async function readJsonObjectBody(
  c: Context,
): Promise<Record<string, unknown>> {
  const raw = (await c.req.json().catch(() => ({}))) || {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

export function teamAccessMiddleware(config: TeamAccessMiddlewareConfig) {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");
    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    let teamId: string | null = null;
    // Resolved project id (when the source references a project or task), so
    // project-bound API keys can be scoped before the handler runs.
    let projectId: string | null = null;

    for (const source of config.sources) {
      if (source.type === "query") {
        teamId = c.req.query(source.key) || null;
      } else if (source.type === "body") {
        const body = await readJsonObjectBody(c);
        const bodyValue = body[source.key];
        teamId = typeof bodyValue === "string" ? bodyValue : null;
      } else if (source.type === "param") {
        teamId = c.req.param(source.key) || null;
      } else if (source.type === "lookup") {
        const body = await readJsonObjectBody(c);
        const bodyId = body[source.idKey];
        const idFromBody = typeof bodyId === "string" ? bodyId : null;
        const id = c.req.param(source.idKey) || idFromBody;
        if (id) {
          const resolved = await lookupTeamAndProjectId(source.resource, id);
          teamId = resolved?.teamId ?? null;
          if (PROJECT_SCOPED_RESOURCES.has(source.resource)) {
            // For "project" the id itself is the project; for "task" the
            // lookup joined through the task's project.
            projectId =
              source.resource === "project"
                ? id
                : (resolved?.projectId ?? null);
          }
        }
      } else if (source.type === "lookupMany") {
        const body = await readJsonObjectBody(c);
        const ids = body[source.idKey];
        if (Array.isArray(ids)) {
          const taskIds = ids.filter(
            (id): id is string => typeof id === "string",
          );
          if (taskIds.length > 0) {
            const tasks = await db
              .select({
                teamId: schema.projectTable.teamId,
                projectId: schema.taskTable.projectId,
              })
              .from(schema.taskTable)
              .innerJoin(
                schema.projectTable,
                eq(schema.taskTable.projectId, schema.projectTable.id),
              )
              .where(inArray(schema.taskTable.id, taskIds));
            const teamIds = [...new Set(tasks.map((task) => task.teamId))];
            if (teamIds.length === 0) {
              throw new HTTPException(404, { message: "No tasks found" });
            }
            if (teamIds.length > 1) {
              throw new HTTPException(400, {
                message: "All tasks must belong to the same team",
              });
            }
            const projectIds = [
              ...new Set(tasks.map((task) => task.projectId)),
            ];
            teamId = teamIds[0] ?? null;
            projectId =
              projectIds.length === 1 ? (projectIds[0] ?? null) : null;
          }
        }
      }

      if (teamId) {
        break;
      }
    }

    if (!teamId) {
      throw new HTTPException(400, {
        message: "Team ID could not be determined",
      });
    }

    // Project binding for API keys: a key bound to a project may only touch
    // that project. Unbound keys and human sessions are unrestricted here.
    const apiKey = c.get("apiKey") as { projectId?: string | null } | undefined;
    if (apiKey?.projectId && projectId) {
      assertProjectScope(
        { projectId: apiKey.projectId } as Parameters<
          typeof assertProjectScope
        >[0],
        projectId,
      );
    }

    // Authorization: caller must be a member of this team (any role).
    const [member] = await db
      .select({ role: schema.teamMemberTable.role })
      .from(schema.teamMemberTable)
      .where(
        and(
          eq(schema.teamMemberTable.teamId, teamId),
          eq(schema.teamMemberTable.userId, userId),
        ),
      )
      .limit(1);

    if (!member?.role) {
      throw new HTTPException(403, { message: "Not a member of this team" });
    }

    c.set("teamId", teamId);
    c.set("teamRole", member.role);

    return next();
  };
}

async function lookupTeamAndProjectId(
  resource:
    | "project"
    | "task"
    | "label"
    | "timeEntry"
    | "activity"
    | "comment"
    | "column"
    | "workflowRule"
    | "customField",
  id: string,
): Promise<{ teamId: string | null; projectId: string | null } | null> {
  try {
    switch (resource) {
      case "project": {
        const [project] = await db
          .select({ teamId: schema.projectTable.teamId })
          .from(schema.projectTable)
          .where(eq(schema.projectTable.id, id))
          .limit(1);
        return project
          ? { teamId: project.teamId || null, projectId: id }
          : null;
      }

      case "task": {
        const [task] = await db
          .select({
            teamId: schema.projectTable.teamId,
            projectId: schema.taskTable.projectId,
          })
          .from(schema.taskTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.taskTable.id, id))
          .limit(1);
        return task
          ? { teamId: task.teamId || null, projectId: task.projectId || null }
          : null;
      }

      case "label": {
        const [label] = await db
          .select({
            teamId: schema.labelTable.teamId,
            taskId: schema.labelTable.taskId,
            taskTeamId: schema.projectTable.teamId,
          })
          .from(schema.labelTable)
          .leftJoin(
            schema.taskTable,
            eq(schema.labelTable.taskId, schema.taskTable.id),
          )
          .leftJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.labelTable.id, id))
          .limit(1);
        // Older releases allowed inconsistent label/task references. Never use
        // such a row to authorize reads, mutations or external provider sync.
        if (label?.taskId && label.taskTeamId !== label.teamId) {
          return null;
        }
        return label ? { teamId: label.teamId || null, projectId: null } : null;
      }

      case "timeEntry": {
        const [timeEntry] = await db
          .select({
            teamId: schema.projectTable.teamId,
            projectId: schema.taskTable.projectId,
          })
          .from(schema.timeEntryTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.timeEntryTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.timeEntryTable.id, id))
          .limit(1);
        return timeEntry
          ? {
              teamId: timeEntry.teamId || null,
              projectId: timeEntry.projectId || null,
            }
          : null;
      }

      case "activity": {
        const [activity] = await db
          .select({
            teamId: schema.projectTable.teamId,
            projectId: schema.taskTable.projectId,
          })
          .from(schema.activityTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.activityTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.activityTable.id, id))
          .limit(1);
        return activity
          ? {
              teamId: activity.teamId || null,
              projectId: activity.projectId || null,
            }
          : null;
      }

      case "comment": {
        const [comment] = await db
          .select({
            teamId: schema.projectTable.teamId,
            projectId: schema.taskTable.projectId,
          })
          .from(schema.activityTable)
          .innerJoin(
            schema.taskTable,
            eq(schema.activityTable.taskId, schema.taskTable.id),
          )
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(
            and(
              eq(schema.activityTable.id, id),
              eq(schema.activityTable.type, "comment"),
            ),
          )
          .limit(1);
        return comment
          ? {
              teamId: comment.teamId || null,
              projectId: comment.projectId || null,
            }
          : null;
      }

      case "column": {
        const [column] = await db
          .select({ teamId: schema.projectTable.teamId })
          .from(schema.columnTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.columnTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.columnTable.id, id))
          .limit(1);
        return column
          ? { teamId: column.teamId || null, projectId: null }
          : null;
      }

      case "workflowRule": {
        const [workflowRule] = await db
          .select({ teamId: schema.projectTable.teamId })
          .from(schema.workflowRuleTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.workflowRuleTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.workflowRuleTable.id, id))
          .limit(1);
        return workflowRule
          ? { teamId: workflowRule.teamId || null, projectId: null }
          : null;
      }

      case "customField": {
        const [customField] = await db
          .select({ teamId: schema.projectTable.teamId })
          .from(schema.customFieldDefinitionTable)
          .innerJoin(
            schema.projectTable,
            eq(
              schema.customFieldDefinitionTable.projectId,
              schema.projectTable.id,
            ),
          )
          .where(eq(schema.customFieldDefinitionTable.id, id))
          .limit(1);
        return customField
          ? { teamId: customField.teamId || null, projectId: null }
          : null;
      }

      default:
        return null;
    }
  } catch (error) {
    console.error(`Error looking up teamId for ${resource}:`, error);
    return null;
  }
}

export const teamAccess = {
  fromQuery: (key = "teamId") =>
    teamAccessMiddleware({ sources: [{ type: "query", key }] }),

  fromBody: (key = "teamId") =>
    teamAccessMiddleware({ sources: [{ type: "body", key }] }),

  fromTeam: (key = "teamId") =>
    teamAccessMiddleware({ sources: [{ type: "param", key }] }),

  fromProject: (idKey = "id") =>
    teamAccessMiddleware({
      sources: [{ type: "lookup", resource: "project", idKey }],
    }),

  fromTask: (idKey = "id") =>
    teamAccessMiddleware({
      sources: [
        { type: "lookup", resource: "task", idKey },
        { type: "query", key: "teamId" },
      ],
    }),

  fromTaskId: (idKey = "taskId") =>
    teamAccessMiddleware({
      sources: [
        { type: "lookup", resource: "task", idKey },
        { type: "query", key: "teamId" },
      ],
    }),

  fromTasks: (idKey = "taskIds") =>
    teamAccessMiddleware({
      sources: [{ type: "lookupMany", resource: "task", idKey }],
    }),

  fromLabel: (idKey = "id") =>
    teamAccessMiddleware({
      sources: [
        { type: "lookup", resource: "label", idKey },
        { type: "query", key: "teamId" },
      ],
    }),

  fromTimeEntry: (idKey = "id") =>
    teamAccessMiddleware({
      sources: [
        { type: "lookup", resource: "timeEntry", idKey },
        { type: "query", key: "teamId" },
      ],
    }),

  fromActivity: (idKey = "id") =>
    teamAccessMiddleware({
      sources: [
        { type: "lookup", resource: "activity", idKey },
        { type: "query", key: "teamId" },
      ],
    }),

  fromComment: (idKey = "id") =>
    teamAccessMiddleware({
      sources: [
        { type: "lookup", resource: "comment", idKey },
        { type: "query", key: "teamId" },
      ],
    }),

  fromColumn: (idKey = "id") =>
    teamAccessMiddleware({
      sources: [
        { type: "lookup", resource: "column", idKey },
        { type: "query", key: "teamId" },
      ],
    }),

  fromWorkflowRule: (idKey = "id") =>
    teamAccessMiddleware({
      sources: [
        { type: "lookup", resource: "workflowRule", idKey },
        { type: "query", key: "teamId" },
      ],
    }),
};

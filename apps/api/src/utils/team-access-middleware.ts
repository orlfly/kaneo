import { and, eq, inArray } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";

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
        | "workflowRule";
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
          teamId = await lookupTeamId(source.resource, id);
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
              .select({ teamId: schema.projectTable.teamId })
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
            teamId = teamIds[0] ?? null;
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

async function lookupTeamId(
  resource:
    | "project"
    | "task"
    | "label"
    | "timeEntry"
    | "activity"
    | "comment"
    | "column"
    | "workflowRule",
  id: string,
): Promise<string | null> {
  try {
    switch (resource) {
      case "project": {
        const [project] = await db
          .select({ teamId: schema.projectTable.teamId })
          .from(schema.projectTable)
          .where(eq(schema.projectTable.id, id))
          .limit(1);
        return project?.teamId || null;
      }

      case "task": {
        const [task] = await db
          .select({ teamId: schema.projectTable.teamId })
          .from(schema.taskTable)
          .innerJoin(
            schema.projectTable,
            eq(schema.taskTable.projectId, schema.projectTable.id),
          )
          .where(eq(schema.taskTable.id, id))
          .limit(1);
        return task?.teamId || null;
      }

      case "label": {
        const [label] = await db
          .select({ teamId: schema.labelTable.teamId })
          .from(schema.labelTable)
          .where(eq(schema.labelTable.id, id))
          .limit(1);
        return label?.teamId || null;
      }

      case "timeEntry": {
        const [timeEntry] = await db
          .select({ teamId: schema.projectTable.teamId })
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
        return timeEntry?.teamId || null;
      }

      case "activity": {
        const [activity] = await db
          .select({ teamId: schema.projectTable.teamId })
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
        return activity?.teamId || null;
      }

      case "comment": {
        const [comment] = await db
          .select({ teamId: schema.projectTable.teamId })
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
        return comment?.teamId || null;
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
        return column?.teamId || null;
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
        return workflowRule?.teamId || null;
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

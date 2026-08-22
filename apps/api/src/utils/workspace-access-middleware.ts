// Back-compat shim that delegates to the new team access middleware. Routes
// still importing `workspaceAccess.fromXxx` will route through the same
// helpers as `teamAccess.fromXxx` (with the same name mapping). The legacy
// param/body key is treated as a team id since the new schema only stores
// teamId.
import { teamAccessMiddleware } from "./team-access-middleware";

type Resource =
  | "project"
  | "task"
  | "label"
  | "timeEntry"
  | "activity"
  | "comment"
  | "column"
  | "workflowRule";

export function workspaceAccessMiddleware(config: {
  source?:
    | "query"
    | "body"
    | "param"
    | "project"
    | "task"
    | "tasks"
    | "label"
    | "timeEntry"
    | "activity"
    | "comment"
    | "column"
    | "workflowRule";
  key?: string;
}) {
  const source = config.source ?? "param";

  if (source === "query") {
    return teamAccessMiddleware({
      sources: [{ type: "query", key: config.key ?? "teamId" }],
    });
  }
  if (source === "body") {
    return teamAccessMiddleware({
      sources: [{ type: "body", key: config.key ?? "teamId" }],
    });
  }
  if (source === "param") {
    return teamAccessMiddleware({
      sources: [{ type: "param", key: config.key ?? "teamId" }],
    });
  }
  if (source === "tasks") {
    return teamAccessMiddleware({
      sources: [
        {
          type: "lookupMany",
          resource: "task",
          idKey: config.key ?? "taskIds",
        },
      ],
    });
  }

  const resource = source as Resource;
  return teamAccessMiddleware({
    sources: [{ type: "lookup", resource, idKey: config.key ?? "id" }],
  });
}

export const workspaceAccess = {
  // Defaults mirror the old workspace middleware exactly, with the
  // workspaceId keys translated to teamId. Lookup helpers keep the same
  // idKey defaults ("id", "taskId", "taskIds") and the same fallback to a
  // team/workspace id on the query string, because the shared Hono client in
  // @kaneo/libs calls these routes with a teamId querystring.
  fromQuery: (key = "teamId") =>
    teamAccessMiddleware({ sources: [{ type: "query", key }] }),
  fromBody: (key = "teamId") =>
    teamAccessMiddleware({ sources: [{ type: "body", key }] }),
  fromParam: (key = "teamId") =>
    teamAccessMiddleware({ sources: [{ type: "param", key }] }),
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

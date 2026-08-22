import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { activitySchema, projectSchema, taskSchema } from "../schemas";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import globalSearch from "./controllers/global-search";

const teamSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.nullable(v.string()),
  createdAt: v.date(),
});

const searchResultSchema = v.object({
  tasks: v.optional(v.array(taskSchema)),
  projects: v.optional(v.array(projectSchema)),
  teams: v.optional(v.array(teamSchema)),
  comments: v.optional(v.array(activitySchema)),
  activities: v.optional(v.array(activitySchema)),
});

const search = new Hono<{
  Variables: {
    userId: string;
  };
}>().get(
  "/",
  describeRoute({
    operationId: "globalSearch",
    tags: ["Search"],
    description:
      "Search across tasks, projects, teams, comments, and activities",
    responses: {
      200: {
        description: "Search results",
        content: {
          "application/json": { schema: resolver(searchResultSchema) },
        },
      },
    },
  }),
  validator(
    "query",
    v.object({
      q: v.pipe(
        v.string(),
        v.minLength(1, "Query must be at least 1 character"),
      ),
      type: v.optional(
        v.picklist([
          "all",
          "tasks",
          "projects",
          "teams",
          "comments",
          "activities",
        ]),
        "all",
      ),
      teamId: v.optional(v.string()),
      projectId: v.optional(v.string()),
      limit: v.optional(
        v.pipe(
          v.string(),
          v.transform(Number),
          v.number(),
          v.integer("Limit must be an integer"),
          v.minValue(1, "Limit must be at least 1"),
          v.maxValue(50, "Limit must not exceed 50"),
        ),
        "20",
      ),
      userEmail: v.optional(v.pipe(v.string(), v.email())),
    }),
  ),
  workspaceAccess.fromQuery(),
  async (c) => {
    const { q, type, teamId, projectId, limit, userEmail } =
      c.req.valid("query");
    const userId = c.get("userId");

    const results = await globalSearch({
      query: q,
      userId,
      userEmail,
      type,
      teamId,
      projectId,
      limit,
    });

    return c.json(results);
  },
);

export default search;

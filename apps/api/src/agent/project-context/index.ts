import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import db from "../../database";
import { projectTable } from "../../database/schema";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { validateWorkspaceAccess } from "../../utils/validate-workspace-access";
import { getProjectContext } from "../controllers/get-project-context";

const projectContextQuery = z.object({
  projectId: z.string().optional().openapi({
    description:
      "Project to fetch context for. Required for API keys not bound to a project; a project-bound key may omit it (defaults to its binding).",
  }),
  taskId: z.string().optional().openapi({
    description:
      "Include full details of this task (must belong to the project).",
  }),
});

const projectContextResponse = z
  .object({
    project: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      description: z.string(),
      teamName: z.string(),
    }),
    statuses: z.array(z.string()),
    taskSummary: z.object({
      total: z.number(),
      byStatus: z.record(z.string(), z.number()),
      overdue: z.number(),
    }),
    vcs: z.object({
      connected: z.boolean(),
      type: z.string().optional(),
      repository: z.string().optional(),
    }),
    task: z.record(z.string(), z.unknown()).optional(),
    checkedAt: z.string().datetime(),
  })
  .openapi("ProjectContext");

const getProjectContextRoute = createRoute({
  method: "get",
  operationId: "getAgentProjectContext",
  path: "/",
  tags: ["Agent"],
  summary: "Get project context for task agents",
  description:
    "One-call project context bundle for task-executing agents: project basics, column statuses, task summary, active VCS state (no credentials), and optionally a claimed task's details.",
  request: { query: projectContextQuery },
  responses: {
    200: jsonResponse("Project context bundle", projectContextResponse),
    400: errorResponse("Missing project id"),
    401: errorResponse("Unauthorized"),
    403: errorResponse("Not a member of this team or key bound elsewhere"),
    404: errorResponse("Project or task not found"),
  },
});

const app = apiRouter().openapi(getProjectContextRoute, async (c) => {
  const query = c.req.valid("query");
  const apiKey = c.get("apiKey");
  const userId = c.get("userId");

  // Project-bound API keys are pinned to their project: the binding wins and
  // a mismatched explicit projectId is rejected. Unbound callers must name a
  // project and pass the team membership check.
  const boundProjectId = apiKey?.projectId ?? null;
  if (boundProjectId && query.projectId && query.projectId !== boundProjectId) {
    throw new HTTPException(403, {
      message: "This API key is bound to a different project.",
    });
  }
  const projectId = boundProjectId ?? query.projectId;
  if (!projectId) {
    throw new HTTPException(400, {
      message: "projectId is required for API keys not bound to a project",
    });
  }

  const [project] = await db
    .select({ teamId: projectTable.teamId })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  await validateWorkspaceAccess(userId, project.teamId);

  const bundle = await getProjectContext({ projectId, taskId: query.taskId });
  return c.json(bundle, 200);
});

export default app;

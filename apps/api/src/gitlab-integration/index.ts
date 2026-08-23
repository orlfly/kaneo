import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { integrationTable, projectTable } from "../database/schema";
import {
  type GitLabConfig,
  validateGitLabConfig,
} from "../plugins/gitlab/config";
import { handleGitLabWebhookRequest } from "../plugins/gitlab/webhook-handler";
import { gitlabIntegrationSchema } from "../schemas";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { validateWorkspaceAccess } from "../utils/validate-workspace-access";
import {
  workspaceAccess,
  workspaceAccessMiddleware,
} from "../utils/workspace-access-middleware";
import createGitLabIntegration from "./controllers/create-gitlab-integration";
import deleteGitLabIntegration from "./controllers/delete-gitlab-integration";
import getGitLabIntegration from "./controllers/get-gitlab-integration";
import { importGitLabIssues } from "./controllers/import-gitlab-issues";
import listGitLabRepositories from "./controllers/list-gitlab-repositories";
import verifyGitLabAccess from "./controllers/verify-gitlab-access";

const gitlabRepositorySchema = v.object({
  id: v.number(),
  name: v.string(),
  full_name: v.string(),
  owner: v.object({
    login: v.string(),
  }),
  private: v.boolean(),
  html_url: v.string(),
});

const verificationResultSchema = v.object({
  isInstalled: v.boolean(),
  hasRequiredPermissions: v.boolean(),
  repositoryExists: v.boolean(),
  repositoryPrivate: v.nullable(v.boolean()),
  missingPermissions: v.array(v.string()),
  message: v.string(),
  failureReason: v.nullable(
    v.picklist(["not_a_gitlab_instance", "redirected", "repository_not_found"]),
  ),
});

const importResultSchema = v.object({
  imported: v.number(),
  updated: v.number(),
  skipped: v.number(),
  errors: v.optional(v.array(v.string())),
});

const nullableGitLabIntegrationSchema = v.nullable(gitlabIntegrationSchema);

const gitlabIntegration = new Hono<{
  Variables: {
    userId: string;
    teamId: string;
    apiKey?: {
      id: string;
      userId: string;
      enabled: boolean;
    };
  };
}>()
  .post(
    "/repositories",
    describeRoute({
      operationId: "listGitLabRepositories",
      tags: ["GitLab"],
      description: "List repositories accessible with a GitLab token",
      responses: {
        200: {
          description: "Repositories",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  repositories: v.array(gitlabRepositorySchema),
                }),
              ),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        projectId: v.pipe(v.string(), v.minLength(1)),
        baseUrl: v.pipe(v.string(), v.url()),
        accessToken: v.pipe(v.string(), v.minLength(1)),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) => {
      const { baseUrl, accessToken } = c.req.valid("json");
      const result = await listGitLabRepositories({ baseUrl, accessToken });
      return c.json(result);
    },
  )
  .post(
    "/verify",
    describeRoute({
      operationId: "verifyGitLabAccess",
      tags: ["GitLab"],
      description: "Verify GitLab token and repository access",
      responses: {
        200: {
          description: "Verification result",
          content: {
            "application/json": {
              schema: resolver(verificationResultSchema),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        projectId: v.pipe(v.string(), v.minLength(1)),
        baseUrl: v.pipe(v.string(), v.url()),
        accessToken: v.pipe(v.string(), v.minLength(1)),
        repositoryOwner: v.pipe(v.string(), v.minLength(1)),
        repositoryName: v.pipe(v.string(), v.minLength(1)),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) => {
      const body = c.req.valid("json");
      const result = await verifyGitLabAccess(body);
      return c.json(result);
    },
  )
  .get(
    "/project/:projectId",
    describeRoute({
      operationId: "getGitLabIntegration",
      tags: ["GitLab"],
      description: "Get GitLab integration for a project",
      responses: {
        200: {
          description: "GitLab integration details",
          content: {
            "application/json": {
              schema: resolver(nullableGitLabIntegrationSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    workspaceAccessMiddleware({
      source: "project",
      key: "projectId",
    }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const includeWebhookSecret = await hasWorkspacePermission(c, {
        workspace: ["manage_settings"],
      });
      const integration = await getGitLabIntegration(
        projectId,
        includeWebhookSecret,
      );
      if (!integration) {
        return c.json(null, 200);
      }
      return c.json(integration);
    },
  )
  .post(
    "/project/:projectId",
    describeRoute({
      operationId: "createGitLabIntegration",
      tags: ["GitLab"],
      description: "Create or update GitLab integration for a project",
      responses: {
        200: {
          description: "Integration saved",
          content: {
            "application/json": {
              schema: resolver(gitlabIntegrationSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "json",
      v.object({
        baseUrl: v.pipe(v.string(), v.minLength(1)),
        accessToken: v.optional(v.string()),
        repositoryOwner: v.pipe(v.string(), v.minLength(1)),
        repositoryName: v.pipe(v.string(), v.minLength(1)),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");
      await createGitLabIntegration({
        projectId,
        baseUrl: body.baseUrl,
        accessToken: body.accessToken,
        repositoryOwner: body.repositoryOwner,
        repositoryName: body.repositoryName,
      });
      const integration = await getGitLabIntegration(projectId, true);
      if (!integration) {
        throw new HTTPException(500, { message: "Failed to load integration" });
      }
      return c.json(integration);
    },
  )
  .patch(
    "/project/:projectId",
    describeRoute({
      operationId: "updateGitLabIntegration",
      tags: ["GitLab"],
      description: "Update GitLab integration settings",
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: resolver(gitlabIntegrationSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "json",
      v.object({
        isActive: v.optional(v.boolean()),
        commentTaskLinkOnGitLabIssue: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      const row = await db.query.integrationTable.findFirst({
        where: and(
          eq(integrationTable.projectId, projectId),
          eq(integrationTable.type, "gitlab"),
        ),
      });

      if (!row) {
        return c.json({ error: "Integration not found" }, 404);
      }

      let config: GitLabConfig;
      try {
        config = JSON.parse(row.config) as GitLabConfig;
      } catch {
        throw new HTTPException(500, { message: "Invalid integration config" });
      }

      if (body.commentTaskLinkOnGitLabIssue !== undefined) {
        config = {
          ...config,
          commentTaskLinkOnGitLabIssue: body.commentTaskLinkOnGitLabIssue,
        };
      }

      const validation = await validateGitLabConfig(config);
      if (!validation.valid) {
        throw new HTTPException(400, {
          message: validation.errors?.join(", ") ?? "Invalid config",
        });
      }

      await db
        .update(integrationTable)
        .set({
          config: JSON.stringify(config),
          isActive:
            body.isActive !== undefined
              ? body.isActive
              : (row.isActive ?? true),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrationTable.projectId, projectId),
            eq(integrationTable.type, "gitlab"),
          ),
        );

      const updated = await getGitLabIntegration(projectId, true);
      if (!updated) {
        throw new HTTPException(500, { message: "Failed to load integration" });
      }
      return c.json(updated, 200);
    },
  )
  .delete(
    "/project/:projectId",
    describeRoute({
      operationId: "deleteGitLabIntegration",
      tags: ["GitLab"],
      description: "Delete GitLab integration for a project",
      responses: {
        200: {
          description: "Deleted",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  success: v.boolean(),
                  message: v.string(),
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const result = await deleteGitLabIntegration(projectId);
      return c.json(result);
    },
  )
  .post(
    "/import-issues",
    describeRoute({
      operationId: "importGitLabIssues",
      tags: ["GitLab"],
      description: "Import GitLab issues as tasks",
      responses: {
        200: {
          description: "Import result",
          content: {
            "application/json": {
              schema: resolver(importResultSchema),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        projectId: v.string(),
      }),
    ),
    async (c, next) => {
      const userId = c.get("userId");
      if (!userId) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const { projectId } = c.req.valid("json");

      const [project] = await db
        .select({ teamId: projectTable.teamId })
        .from(projectTable)
        .where(eq(projectTable.id, projectId))
        .limit(1);

      if (!project) {
        throw new HTTPException(404, { message: "Project not found" });
      }

      const apiKey = c.get("apiKey");
      const apiKeyId = apiKey?.id;

      await validateWorkspaceAccess(userId, project.teamId, apiKeyId);
      c.set("teamId", project.teamId);

      return next();
    },
    requireWorkspacePermission({ task: ["create"] }),
    async (c) => {
      const { projectId } = c.req.valid("json");
      const result = await importGitLabIssues(projectId);
      return c.json(result);
    },
  );

export async function handleGitLabWebhookRoute(c: Context) {
  const integrationId = c.req.param("integrationId");
  if (!integrationId) {
    return c.json({ error: "Missing integration id" }, 400);
  }

  const arrayBuffer = await c.req.arrayBuffer();
  const body = Buffer.from(arrayBuffer).toString("utf8");

  // GitLab sends the hook token verbatim in X-Gitlab-Token (no HMAC).
  const tokenHeader =
    c.req.header("x-gitlab-token") || c.req.header("X-Gitlab-Token");

  const eventName =
    c.req.header("x-gitlab-event") ||
    c.req.header("X-GitLab-Event") ||
    c.req.header("x-github-event");

  const result = await handleGitLabWebhookRequest(
    integrationId,
    body,
    tokenHeader,
    eventName,
  );

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ status: "success" });
}

export default gitlabIntegration;

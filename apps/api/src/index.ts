import "./instrument";

import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { OpenAPIHono } from "@hono/zod-openapi";
import * as Sentry from "@sentry/node";
import type { Session, User } from "better-auth/types";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { generateSpecs, openAPIRouteHandler } from "hono-openapi";
import activity from "./activity";
import adminRoutes from "./admin";
import agentConfig from "./agent/agents";
import { auth } from "./auth";
import { organizationRoutes } from "./auth-openapi";
import chat from "./chat";
import chatPublic from "./chat/public";
import column from "./column";
import comment from "./comment";
import config from "./config";
import customField from "./custom-field";
import db, { getDatabase, schema } from "./database";
import { prepareDatabaseStartup } from "./database/prepare-database-startup";
import { waitForDatabase } from "./database/wait-for-database";
import discordIntegration from "./discord-integration";
import { eventContext } from "./events";
import externalLink from "./external-link";
import genericWebhookIntegration from "./generic-webhook-integration";
import giteaIntegration, { handleGiteaWebhookRoute } from "./gitea-integration";
import githubIntegration, {
  handleGithubWebhookRoute,
} from "./github-integration";
import gitlabIntegration, {
  handleGitLabWebhookRoute,
} from "./gitlab-integration";
import getInstanceStatus from "./instance/controllers/get-instance-status";
import label from "./label";
import mattermostIntegration from "./mattermost-integration";
import mcpRoutes, { mcpWellKnownRoutes } from "./mcp";
import { migrateColumns } from "./migrations/column-migration";
import notification from "./notification";
import notificationPreferences from "./notification-preferences";
import oauth from "./oauth";
import { createRoute, errorResponse, jsonResponse, z } from "./openapi";
import { initializePlugins } from "./plugins";
import { migrateGitHubIntegration } from "./plugins/github/migration";
import project from "./project";
import { getPublicProject } from "./project/controllers/get-public-project";
import { initializeScheduler, shutdownScheduler } from "./scheduler";
import search from "./search";
import slackIntegration from "./slack-integration";
import { getPrivateObject } from "./storage/s3";
import task from "./task";
import {
  getDescriptionPage,
  getPublicProjectDescriptionPage,
} from "./task/description-pages";
import { boardSchema, descriptionPageSchema } from "./task/response";
import { descriptionPageQuery, listTasksQuery } from "./task/schema";
import taskRelation from "./task-relation";
import team from "./team";
import telegramIntegration from "./telegram-integration";
import timeEntry from "./time-entry";
import user from "./user";
import getAvatar from "./user/controllers/get-avatar";
import { authenticateApiRequest } from "./utils/authenticate-api-request";
import {
  authorizeAssetAccess,
  isPublicAsset,
} from "./utils/authorize-asset-access";
import { clientIpMiddleware } from "./utils/client-ip";
import { ensureAdminUser } from "./utils/ensure-admin-user";
import { migrateApiKeyReferenceId } from "./utils/migrate-apikey-reference-id";
import { migrateNotificationPreferencesSchema } from "./utils/migrate-notification-preferences-schema";
import { migrateSessionColumn } from "./utils/migrate-session-column";
import { migrateWorkspaceUserEmail } from "./utils/migrate-workspace-user-email";
import { migrateWorkspacesToTeams } from "./utils/migrate-workspaces-to-teams";
import {
  dedupeOperationIds,
  ensureOperationSummaries,
  markOptionalSchemaFieldsNullable,
  mergeOpenApiSpecs,
  normalizeApiServerUrl,
  normalizeEmptyAndEnumSchemas,
  normalizeEmptyRequiredArrays,
  normalizeMalformedPropertySchemas,
  normalizeNullableSchemasForOpenApi30,
  normalizeOrganizationAuthOperations,
} from "./utils/openapi-spec";
import workflowRule from "./workflow-rule";
import {
  addConnection,
  addUserConnection,
  initializeWebSocketAdapter,
  removeConnection,
  removeUserConnection,
  shutdownWebSocketAdapter,
} from "./ws";
import {
  assertWebSocketOrigin,
  handleWebSocketMessage,
  MAX_WEBSOCKET_MESSAGE_BYTES,
} from "./ws/security";

type ApiKey = {
  id: string;
  userId: string;
  enabled: boolean;
  permissions: Record<string, string[]> | null;
  metadata: Record<string, unknown> | null;
  agentRole: import("./utils/agent-role").ApiKeyContext["agentRole"];
  projectId: string | null;
};

type AppVariables = {
  Variables: {
    user: User | null;
    session: Session | null;
    userId: string;
    apiKey?: ApiKey;
  };
};

type ApiVariables = {
  Variables: {
    user: User | null;
    session: Session | null;
    userId: string;
    userEmail: string;
    apiKey?: ApiKey;
  };
};

const SAFE_INLINE_ASSET_TYPES = new Set([
  "image/apng",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function buildContentDisposition(filename: string, inline: boolean) {
  const normalized = filename
    .normalize("NFC")
    .replace(/[\r\n"]/g, "")
    .trim();
  const safeFilename = normalized || "file";
  const asciiFallback =
    safeFilename
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/]/g, "-")
      .replace(/[^\x20-\x7E]+/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "file";
  const encodedFilename = encodeURIComponent(safeFilename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  const disposition = inline ? "inline" : "attachment";
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

export function createApp() {
  const app = new Hono<AppVariables>();
  app.use("*", clientIpMiddleware());

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      // expected errors (401/404/...) are not reported; real failures are
      if (err.status >= 500) {
        Sentry.captureException(err);
      }
      return err.getResponse();
    }

    Sentry.captureException(err);
    return c.json({ message: "Internal Server Error" }, 500);
  });
  const nodeWs = createNodeWebSocket({ app });
  // node-ws exposes its ws server, but does not accept constructor options.
  // Set the receiver limit before any connection can upgrade, including
  // fragmented messages, before node-ws converts text buffers to strings.
  nodeWs.wss.options.maxPayload = MAX_WEBSOCKET_MESSAGE_BYTES;
  nodeWs.wss.options.perMessageDeflate = false;
  const { upgradeWebSocket, injectWebSocket } = nodeWs;
  const corsOriginSource = [
    process.env.CORS_ORIGINS,
    process.env.KANEO_CLIENT_URL,
  ].find((value) => value?.trim());
  const corsOrigins = corsOriginSource
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const reflectUnconfiguredOrigins = process.env.NODE_ENV !== "production";

  if (!corsOrigins && !reflectUnconfiguredOrigins) {
    console.warn(
      "[cors] Neither CORS_ORIGINS nor KANEO_CLIENT_URL is set, so cross-origin requests are refused. Same-origin deployments (the bundled image) are unaffected; set KANEO_CLIENT_URL if the web app is served from another origin.",
    );
  }

  app.use(
    "*",
    cors({
      credentials: true,
      origin: (origin) => {
        // Reflecting an arbitrary origin alongside credentials lets any site
        // read authenticated responses, so it stays a development convenience.
        if (!corsOrigins) {
          return reflectUnconfiguredOrigins ? origin || "*" : null;
        }

        if (!origin) {
          return null;
        }

        return corsOrigins.includes(origin) ? origin : null;
      },
    }),
  );

  // Large boards return multi-MB JSON (board/task list responses embed
  // labels and external links per task); gzip cuts that by 85-95% since
  // JSON with repeated keys compresses extremely well.
  app.use(compress());

  const api = new OpenAPIHono<ApiVariables>();

  api.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getInstanceStatus",
      path: "/instance/status",
      tags: ["Instance"],
      summary: "Get instance status",
      description:
        "Public instance setup status. When hasUsers is false the next signup becomes the instance admin.",
      security: [],
      responses: {
        200: jsonResponse(
          "Instance status",
          z
            .object({ hasUsers: z.boolean(), hasAdmin: z.boolean() })
            .openapi("InstanceStatus"),
        ),
      },
    }),
    async (c) => c.json(await getInstanceStatus(), 200),
  );

  const publicProjectApi = api
    .openapi(
      createRoute({
        method: "get",
        operationId: "getPublicProject",
        path: "/public-project/{id}",
        tags: ["Projects"],
        summary: "Get a public project board",
        description:
          "Read a public board in bounded task pages. Visibility is checked before loading tasks. Continue through pagination.totalPages for all tasks and through relatedPage/pagination.relatedTotalPages for their complete related records.",
        security: [],
        request: {
          params: z.object({ id: z.string() }),
          query: listTasksQuery,
        },
        responses: {
          200: jsonResponse(
            "A public board page",
            boardSchema.shape.data
              .extend({ pagination: boardSchema.shape.pagination })
              .openapi("PublicBoardPage"),
          ),
          403: errorResponse("Project is not public"),
          404: errorResponse("Project not found"),
          400: errorResponse("Invalid pagination or filters"),
          503: errorResponse("Task list request timed out"),
        },
      }),
      async (c) => {
        const { id } = c.req.valid("param");
        const project = await getPublicProject(id, c.req.valid("query"));
        return c.json(project, 200);
      },
      (result) => {
        if (!result.success)
          throw new HTTPException(400, {
            message: "Invalid task pagination or filters",
          });
      },
    )
    .openapi(
      createRoute({
        method: "get",
        operationId: "getPublicProjectDescriptionPage",
        path: "/public-project/{id}/description",
        tags: ["Projects"],
        summary: "Read a public project description page",
        security: [],
        request: {
          params: z.object({ id: z.string() }),
          query: descriptionPageQuery,
        },
        responses: {
          200: jsonResponse(
            "Public project description page",
            descriptionPageSchema,
          ),
          400: errorResponse("Invalid description cursor"),
          404: errorResponse("Public project not found"),
          409: errorResponse("Description changed or no longer public"),
          503: errorResponse("Description request timed out"),
        },
      }),
      async (c) =>
        c.json(
          await getPublicProjectDescriptionPage(
            c.req.valid("param").id,
            c.req.valid("query"),
          ),
          200,
        ),
      (result) => {
        if (!result.success)
          throw new HTTPException(400, {
            message: "Invalid description cursor",
          });
      },
    )
    .openapi(
      createRoute({
        method: "get",
        operationId: "getPublicTaskDescriptionPage",
        path: "/public-project/{id}/task/{taskId}/description",
        tags: ["Projects"],
        summary: "Read a public task description page",
        security: [],
        request: {
          params: z.object({ id: z.string(), taskId: z.string() }),
          query: descriptionPageQuery,
        },
        responses: {
          200: jsonResponse(
            "Public task description page",
            descriptionPageSchema,
          ),
          400: errorResponse("Invalid description cursor"),
          404: errorResponse("Public task not found"),
          409: errorResponse("Description changed or no longer public"),
          503: errorResponse("Description request timed out"),
        },
      }),
      async (c) => {
        const { id, taskId } = c.req.valid("param");
        return c.json(
          await getDescriptionPage(taskId, {
            ...c.req.valid("query"),
            publicProjectId: id,
          }),
          200,
        );
      },
      (result) => {
        if (!result.success)
          throw new HTTPException(400, {
            message: "Invalid description cursor",
          });
      },
    );

  api.post("/github-integration/webhook", handleGithubWebhookRoute);

  api.post(
    "/gitea-integration/webhook/:integrationId",
    handleGiteaWebhookRoute,
  );

  api.post(
    "/gitlab-integration/webhook/:integrationId",
    handleGitLabWebhookRoute,
  );

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getSession",
      path: "/auth/get-session",
      tags: ["Authentication"],
      summary: "Get session",
      description:
        "Get the current authenticated session, or null when the caller is not signed in. Served by Better Auth.",
      security: [],
      responses: {
        200: {
          description: "Current session details, or null when unauthenticated",
        },
      },
    }),
    async (c) => auth.handler(c.req.raw),
  );

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getAsset",
      path: "/asset/{id}",
      tags: ["Assets"],
      summary: "Download asset",
      description:
        "Download an uploaded asset. Readable without signing in only when it belongs to a public project; image types are served inline, everything else as an attachment.",
      security: [],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          description: "The requested asset binary stream",
          content: { "*/*": { schema: { type: "string", format: "binary" } } },
        },
        304: { description: "Not modified" },
        403: { description: "No access to this asset" },
        404: { description: "Asset not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.param();
      const [asset] = await db
        .select({
          id: schema.assetTable.id,
          objectKey: schema.assetTable.objectKey,
          mimeType: schema.assetTable.mimeType,
          filename: schema.assetTable.filename,
          teamId: schema.assetTable.teamId,
          isPublic: schema.projectTable.isPublic,
          surface: schema.assetTable.surface,
        })
        .from(schema.assetTable)
        .innerJoin(
          schema.projectTable,
          eq(schema.assetTable.projectId, schema.projectTable.id),
        )
        .where(eq(schema.assetTable.id, id))
        .limit(1);

      if (!asset) {
        throw new HTTPException(404, { message: "Asset not found" });
      }

      await authorizeAssetAccess(c, asset);

      try {
        const object = await getPrivateObject(asset.objectKey);
        const storedContentType =
          (object.contentType || asset.mimeType)
            .toLowerCase()
            .split(";")[0]
            ?.trim() ?? "";
        const inline = SAFE_INLINE_ASSET_TYPES.has(storedContentType);

        return new Response(object.body as BodyInit, {
          headers: {
            "Cache-Control": isPublicAsset(asset)
              ? "public, max-age=300"
              : "private, max-age=120",
            "Content-Disposition": buildContentDisposition(
              asset.filename,
              inline,
            ),
            "Content-Length": object.contentLength?.toString() || "",
            "Content-Type": inline
              ? storedContentType
              : "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
            ETag: object.etag || "",
            "Last-Modified": object.lastModified?.toUTCString() || "",
          },
        });
      } catch (error) {
        console.error("Failed to stream asset:", error);
        throw new HTTPException(404, { message: "Asset object not found" });
      }
    },
  );

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getUserAvatar",
      path: "/user/avatar/{id}",
      tags: ["User"],
      summary: "Download avatar",
      description:
        "Download a user avatar by its avatar ID. Public, immutable, and cache-friendly: the id changes whenever the avatar is replaced.",
      security: [],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          description: "The avatar image",
          content: {
            "image/*": { schema: { type: "string", format: "binary" } },
          },
        },
        304: { description: "Not modified" },
        404: { description: "Avatar not found" },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const avatar = await getAvatar(id);

      if (!avatar) {
        throw new HTTPException(404, { message: "Avatar not found" });
      }

      const etag = `"${avatar.id}"`;
      if (c.req.header("If-None-Match") === etag) {
        return new Response(null, { status: 304, headers: { ETag: etag } });
      }

      return new Response(new Uint8Array(avatar.data) as BodyInit, {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Length": avatar.size.toString(),
          "Content-Type": avatar.mimeType,
          "X-Content-Type-Options": "nosniff",
          ETag: etag,
          "Last-Modified": avatar.updatedAt.toUTCString(),
        },
      });
    },
  );

  const configApi = api.route("/config", config);
  const agentConfigApi = api.route("/agent/agents-config", agentConfig);

  api.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "API key or session token (Bearer)",
  });
  organizationRoutes(api.openAPIRegistry);

  const honoOpenApiHandler = openAPIRouteHandler(api, {
    documentation: {
      openapi: "3.0.3",
      info: {
        title: "Kaneo API",
        version: "1.0.0",
        description:
          "Kaneo Project Management API - Manage projects, tasks, labels, and more",
      },
      servers: [
        {
          url: normalizeApiServerUrl(
            process.env.KANEO_API_URL || "https://cloud.kaneo.app",
          ),
          description: "Kaneo API Server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "API key or session token (Bearer)",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  api.get("/openapi", async (c) => {
    const maybeResponse = await honoOpenApiHandler(c, async () => {});
    const honoSpecResponse = maybeResponse ?? c.res;
    const honoSpec = (await honoSpecResponse.json()) as Record<string, unknown>;

    let authSpec: Record<string, unknown> = {};
    try {
      authSpec = (await auth.api.generateOpenAPISchema()) as Record<
        string,
        unknown
      >;
    } catch (error) {
      console.error("Failed to generate Better Auth OpenAPI schema:", error);
    }

    const normalizedAuthSpec = normalizeOrganizationAuthOperations(authSpec);

    // chatPublic routes are mounted on the top-level app at /api/chat (outside
    // the authenticated `api` router), so they are not captured by the Hono
    // OpenAPI handler above. Generate their spec explicitly and prefix the
    // paths with /chat to match the real mount point.
    const chatPublicSpec = await generateSpecs(chatPublic);
    const chatPublicPaths = (chatPublicSpec.paths || {}) as Record<
      string,
      unknown
    >;
    const prefixedChatPaths = Object.fromEntries(
      Object.entries(chatPublicPaths).map(([path, item]) => [
        path === "/" ? "/chat" : `/chat${path}`,
        item,
      ]),
    );
    const chatPublicSpecPrefixed = {
      ...chatPublicSpec,
      paths: prefixedChatPaths,
    };

    return c.json(
      ensureOperationSummaries(
        dedupeOperationIds(
          markOptionalSchemaFieldsNullable(
            normalizeNullableSchemasForOpenApi30(
              normalizeEmptyAndEnumSchemas(
                normalizeEmptyRequiredArrays(
                  normalizeMalformedPropertySchemas(
                    mergeOpenApiSpecs(
                      mergeOpenApiSpecs(honoSpec, chatPublicSpecPrefixed),
                      normalizedAuthSpec,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  });

  // Better Auth serves GET /auth/device as JSON. Browsers that open the API URL
  // directly expect a page, so redirect full document navigations to the web app.
  const authDeviceQuerySchema = z.object({
    user_code: z.string().optional().openapi({
      description: "The device authorization user code.",
    }),
    ui: z.enum(["1"]).optional().openapi({
      description:
        "Force a redirect to the web UI, for clients that do not send Sec-Fetch-* headers.",
    }),
  });

  api.openapi(
    createRoute({
      method: "get",
      operationId: "getDeviceAuthorizationPage",
      path: "/auth/device",
      tags: ["Authentication"],
      summary: "Device authorization page",
      description:
        "Better Auth serves this as JSON. A top-level browser navigation is redirected to the web app's device screen instead, so opening the URL by hand shows a page rather than a JSON blob.",
      security: [],
      request: { query: authDeviceQuerySchema },
      responses: {
        302: {
          description: "Redirects the browser to the web app device screen",
        },
        200: { description: "Device authorization payload from Better Auth" },
      },
    }),
    async (c) => {
      const { user_code: userCode, ui } = c.req.valid("query");
      const secFetchDest = c.req.header("Sec-Fetch-Dest");
      const forceUiRedirect = ui === "1";
      // Top-level browser tab / address bar (not `fetch()` / XHR from the SPA).
      // Optional `ui=1` forces redirect when Sec-Fetch-* headers are missing (e.g. some clients).
      if (forceUiRedirect || secFetchDest === "document") {
        const clientUrl = (
          process.env.KANEO_CLIENT_URL || "http://localhost:5173"
        ).replace(/\/$/, "");
        const deviceUrl = new URL(`${clientUrl}/device`);
        if (userCode) {
          deviceUrl.searchParams.set("user_code", userCode);
        }
        return c.redirect(deviceUrl.toString(), 302);
      }
      return auth.handler(c.req.raw);
    },
  );

  api.on(["POST", "GET", "PUT", "PATCH", "DELETE"], "/auth/*", async (c) => {
    const authHeader = c.req.header("Authorization");
    const apiKeyHeader = c.req.header("x-api-key");
    const bearerToken = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1];

    // The better-auth api-key plugin writes keys via the raw adapter, which
    // bypasses `databaseHooks.apikey.create.before`. Enforce the guard here so
    // an API key can never be created with `metadata.agentRole = "human"` (the
    // reserved required_role marker, not an agent role).
    if (c.req.method === "POST" && c.req.path.endsWith("/api-key/create")) {
      // Clone before reading: c.req.json() consumes the underlying body
      // stream, so the request we hand to auth.handler must be a fresh
      // clone (better-auth re-reads the body via better-call).
      const guardParsed = await c.req.raw
        .clone()
        .json()
        .catch(() => null);
      const metadata = guardParsed?.metadata;
      if (
        metadata &&
        typeof metadata === "object" &&
        "agentRole" in metadata &&
        (metadata as Record<string, unknown>).agentRole === "human"
      ) {
        return c.json(
          {
            message:
              '"human" is a required_role marker, not an agent role. Use one of: coding, product-design, architecture-design, devops, ui-design, testing, code-review.',
            code: "HUMAN_NOT_AGENT_ROLE",
          },
          400,
        );
      }
    }

    if (bearerToken && !apiKeyHeader) {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      // Preserve Better Auth bearer session tokens on auth routes.
      if (session?.session && session.user) {
        return auth.handler(c.req.raw);
      }

      const headers = new Headers(c.req.raw.headers);

      // Better Auth API key plugin validates from x-api-key by default.
      headers.set("x-api-key", bearerToken);

      return auth.handler(
        new Request(c.req.raw, {
          headers,
        }),
      );
    }

    return auth.handler(c.req.raw);
  });

  api.route("/", mcpRoutes);

  api.use("*", async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/api/mcp") || path.startsWith("/api/.well-known/")) {
      return next();
    }
    return Sentry.withIsolationScope(async () => {
      Sentry.setUser(null);
      try {
        await authenticateApiRequest(c);
        const windowId = c.req.header("X-Kaneo-Window-Id");
        const userId = c.get("userId");
        const initiatorId = windowId ? `${userId}:${windowId}` : userId;
        return await eventContext.run({ initiatorId }, next);
      } catch (error) {
        if (!(error instanceof HTTPException)) {
          console.error("API authentication failed:", error);
          throw new HTTPException(500, { message: "Internal Server Error" });
        }
        throw error;
      } finally {
        Sentry.setUser(null);
      }
    });
  });

  const oauthApi = api.route("/oauth", oauth);

  const projectApi = api.route("/project", project);
  const taskApi = api.route("/task", task);
  const columnApi = api.route("/column", column);
  const activityApi = api.route("/activity", activity);
  const commentApi = api.route("/comment", comment);
  const timeEntryApi = api.route("/time-entry", timeEntry);
  const labelApi = api.route("/label", label);
  const notificationApi = api.route("/notification", notification);
  const notificationPreferencesApi = api.route(
    "/notification-preferences",
    notificationPreferences,
  );
  const searchApi = api.route("/search", search);
  const githubIntegrationApi = api.route(
    "/github-integration",
    githubIntegration,
  );
  const giteaIntegrationApi = api.route("/gitea-integration", giteaIntegration);
  const gitlabIntegrationApi = api.route(
    "/gitlab-integration",
    gitlabIntegration,
  );
  const genericWebhookIntegrationApi = api.route(
    "/generic-webhook-integration",
    genericWebhookIntegration,
  );
  const discordIntegrationApi = api.route(
    "/discord-integration",
    discordIntegration,
  );
  const mattermostIntegrationApi = api.route(
    "/mattermost-integration",
    mattermostIntegration,
  );
  const slackIntegrationApi = api.route("/slack-integration", slackIntegration);
  const telegramIntegrationApi = api.route(
    "/telegram-integration",
    telegramIntegration,
  );
  const taskRelationApi = api.route("/task-relation", taskRelation);
  const externalLinkApi = api.route("/external-link", externalLink);
  const workflowRuleApi = api.route("/workflow-rule", workflowRule);
  const teamApi = api.route("/team", team);
  const chatApi = api.route("/chat", chat);
  const customFieldApi = api.route("/custom-field", customField);
  const userApi = api.route("/user", user);
  const adminApi = api.route("/admin", adminRoutes);

  app.route(
    "/",
    mcpWellKnownRoutes(
      (process.env.KANEO_API_URL || "http://localhost:1337").replace(
        /\/api\/?$/,
        "",
      ),
    ),
  );

  // User-scoped WebSocket endpoint; MUST be registered before /ws/:projectId
  // so the literal path "user" isn't consumed by the param route.
  api.get(
    "/ws/user",
    upgradeWebSocket(async (c) => {
      assertWebSocketOrigin(c.req.raw.headers);
      try {
        await authenticateApiRequest(c);
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        console.error("API authentication failed:", error);
        throw new HTTPException(500, { message: "Internal Server Error" });
      }

      const userId = c.get("userId");
      let conn: ReturnType<typeof addUserConnection> | null = null;

      return {
        onOpen(_evt, ws) {
          if (userId) {
            conn = addUserConnection(userId, ws);
          }
        },
        onMessage: handleWebSocketMessage,
        onClose() {
          if (conn && userId) {
            removeUserConnection(userId, conn);
          }
        },
      };
    }),
  );

  api.get(
    "/ws/:projectId",
    upgradeWebSocket(async (c) => {
      assertWebSocketOrigin(c.req.raw.headers);
      const projectId = c.req.param("projectId");

      try {
        await authenticateApiRequest(c);
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        console.error("API authentication failed:", error);
        throw new HTTPException(500, { message: "Internal Server Error" });
      }

      const userId = c.get("userId");

      if (projectId) {
        const [project] = await db
          .select({ teamId: schema.projectTable.teamId })
          .from(schema.projectTable)
          .where(eq(schema.projectTable.id, projectId))
          .limit(1);

        if (!project) {
          throw new HTTPException(401, { message: "Unauthorized" });
        }

        if (project.teamId) {
          const { validateTeamAccess } = await import(
            "./utils/validate-team-access"
          );
          await validateTeamAccess(userId, project.teamId);
        }
      }

      const windowId = c.req.query("windowId");
      const initiatorId = windowId ? `${userId}:${windowId}` : userId;
      let conn: ReturnType<typeof addConnection> | null = null;

      return {
        onOpen(_evt, ws) {
          if (projectId) {
            conn = addConnection(projectId, ws, userId, initiatorId);
          }
        },
        onMessage: handleWebSocketMessage,
        onClose() {
          if (conn && projectId) {
            removeConnection(projectId, conn);
          }
        },
      };
    }),
  );

  app.route("/api/chat", chatPublic);
  app.route("/api", api);

  return {
    app,
    api,
    injectWebSocket,
    activityApi,
    adminApi,
    agentConfigApi,
    columnApi,
    commentApi,
    configApi,
    discordIntegrationApi,
    externalLinkApi,
    genericWebhookIntegrationApi,
    githubIntegrationApi,
    giteaIntegrationApi,
    gitlabIntegrationApi,
    labelApi,
    notificationApi,
    notificationPreferencesApi,
    projectApi,
    publicProjectApi,
    searchApi,
    mattermostIntegrationApi,
    slackIntegrationApi,
    taskApi,
    taskRelationApi,
    teamApi,
    chatApi,
    telegramIntegrationApi,
    timeEntryApi,
    userApi,
    workflowRuleApi,
    customFieldApi,
    oauthApi,
  };
}

export async function runStartupTasks() {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  await prepareDatabaseStartup({
    waitForDatabase: async () => {
      await waitForDatabase({
        query: async () => {
          await getDatabase().execute(sql`SELECT 1`);
        },
      });
    },
    runStartupMigrations: async () => {
      await migrateWorkspaceUserEmail();
      await migrateSessionColumn();

      console.log("🔄 Migrating database...");
      await migrate(getDatabase(), {
        migrationsFolder: `${currentDir}/../drizzle`,
      });
      console.log("✅ Database migrated successfully!");
    },
  });

  // After Drizzle migrations: apikey table must exist so we can align columns
  // with Better Auth (reference_id + nullable user_id).
  await migrateApiKeyReferenceId();

  await migrateNotificationPreferencesSchema();
  await migrateGitHubIntegration();
  await migrateColumns();
  await migrateWorkspacesToTeams();
  await ensureAdminUser();

  initializePlugins();
  initializeScheduler();
  await initializeWebSocketAdapter();
}

export async function startServer(
  injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"],
  port = 1337,
) {
  try {
    await runStartupTasks();
  } catch (error) {
    console.error("❌ Database migration failed!", error);
    process.exit(1);
  }

  let shuttingDown = false;

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    () => {
      console.log(
        `⚡ API is running at ${process.env.KANEO_API_URL || "http://localhost:1337"}`,
      );
    },
  );

  injectWebSocket(server);

  const gracefulShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("🛑 Shutting down gracefully...");
    shutdownScheduler();
    await shutdownWebSocketAdapter();
    server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void gracefulShutdown();
  });

  process.on("SIGINT", () => {
    void gracefulShutdown();
  });
}

const createdApp = createApp();
const {
  app,
  injectWebSocket,
  activityApi,
  adminApi,
  agentConfigApi,
  columnApi,
  commentApi,
  configApi,
  discordIntegrationApi,
  externalLinkApi,
  genericWebhookIntegrationApi,
  githubIntegrationApi,
  giteaIntegrationApi,
  gitlabIntegrationApi,
  labelApi,
  mattermostIntegrationApi,
  notificationApi,
  notificationPreferencesApi,
  projectApi,
  publicProjectApi,
  searchApi,
  slackIntegrationApi,
  taskApi,
  taskRelationApi,
  teamApi,
  chatApi,
  telegramIntegrationApi,
  timeEntryApi,
  userApi,
  workflowRuleApi,
  customFieldApi,
  oauthApi,
} = createdApp;

const entrypoint = process.argv[1];
const isMainModule =
  entrypoint !== undefined &&
  entrypoint !== "" &&
  import.meta.url === pathToFileURL(entrypoint).href;

if (isMainModule) {
  void startServer(injectWebSocket);
}

export type AppType =
  | typeof configApi
  | typeof projectApi
  | typeof taskApi
  | typeof columnApi
  | typeof activityApi
  | typeof adminApi
  | typeof agentConfigApi
  | typeof commentApi
  | typeof timeEntryApi
  | typeof labelApi
  | typeof notificationApi
  | typeof notificationPreferencesApi
  | typeof searchApi
  | typeof githubIntegrationApi
  | typeof giteaIntegrationApi
  | typeof gitlabIntegrationApi
  | typeof genericWebhookIntegrationApi
  | typeof discordIntegrationApi
  | typeof mattermostIntegrationApi
  | typeof slackIntegrationApi
  | typeof telegramIntegrationApi
  | typeof taskRelationApi
  | typeof externalLinkApi
  | typeof workflowRuleApi
  | typeof teamApi
  | typeof chatApi
  | typeof customFieldApi
  | typeof userApi
  | typeof publicProjectApi
  | typeof oauthApi;

export default app;
